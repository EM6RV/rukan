// خدمات الصالة للوحة: الأجهزة والصيانة، الأسعار والباقات، الحجوزات، البطولات، وحالة الصالة (للوحة وشاشة الحائط والصفحة العامة).
import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { STATION_KINDS, STATION_KIND_LABELS } from "@/lib/line-setup";
import { DEFAULT_LOUNGE_RULES, overlaps, rateAt, remainingMinutes, sessionCharge, sessionState } from "@/lib/lounge-pricing";
import { formatDateTime } from "@/lib/datetime";
import { normalizeLibyanPhone } from "@/lib/phone";
import { knockoutBracket, leagueSchedule, setResult, standings, championOf, type Slot } from "@/lib/tournament";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { isUniqueViolation } from "../db-errors";
import { ensureDefaultBranch } from "../pos/branches";
import { posConfigOf } from "../pos/sync";
import { t, type StoreScope } from "../tenant";
import { loungeData } from "./engine";

const money = z.number({ error: "السعر لازم يكون رقم" }).int().min(0, "السعر ما يكونش بالسالب").max(100_000_000);
const MIN = 60_000;

// ===== الأجهزة =====

const stationSchema = z.object({
  id: z.string().min(1).optional(),
  branchId: z.string().min(1).nullish(),
  name: z.string({ error: "اكتب اسم الجهاز" }).trim().min(1, "اكتب اسم الجهاز").max(40, "الاسم طويل"),
  kind: z.enum(STATION_KINDS, { error: "اختار نوع الجهاز" }),
  room: z.enum(["normal", "vip"]).default("normal"),
  seats: z.number().int().min(1).max(30).default(2),
  screen: z.string().trim().max(40).nullish().transform((v) => v || null),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish().transform((v) => v || null),
  games: z.array(z.string().trim().min(1).max(40)).max(60).default([]),
  isActive: z.boolean().default(true),
});

export async function listStations(scope: StoreScope) {
  const [rows, open] = await Promise.all([
    scope.from(t.stations).orderBy(asc(t.stations.position), asc(t.stations.name)),
    scope.from(t.stationMaintenance, eq(t.stationMaintenance.status, "open")),
  ]);
  return rows.map((s) => ({ ...s, openIssues: open.filter((m) => m.stationId === s.id) }));
}

export async function saveStation(scope: StoreScope, maxStations: number | null | undefined, input: unknown): Promise<Result<{ id: string }>> {
  const p = stationSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, branchId, ...d } = p.data;
  try {
    if (id) {
      const [row] = await scope.update(t.stations, d, eq(t.stations.id, id));
      return row ? ok({ id: row.id }) : fail("ما لقينا الجهاز.");
    }
    const active = await scope.count(t.stations, eq(t.stations.isActive, true));
    if (typeof maxStations === "number" && active >= maxStations) return fail(`باقتك تسمح بـ ${maxStations} جهاز. رقّي الباقة أو اشترِ «5 أجهزة إضافية».`);
    const branch = branchId ? (await scope.from(t.branches, eq(t.branches.id, branchId)).limit(1))[0] : await ensureDefaultBranch(scope);
    if (!branch) return fail("الفرع غير موجود.");
    const position = await scope.count(t.stations);
    const [row] = await scope.insert(t.stations, { ...d, branchId: branch.id, position });
    return ok({ id: row!.id });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("فيه جهاز بنفس الاسم في الفرع.");
    throw e;
  }
}

/** ينشئ أجهزة المعالج المبدئي (لو ما فيش أجهزة) */
export async function seedStationsFromSetup(scope: StoreScope, setup: { stations?: { type: string; count: number }[]; hourlyPrice?: number | null } | undefined, maxStations: number | null | undefined) {
  if (!setup?.stations?.length || (await scope.count(t.stations)) > 0) return 0;
  const branch = await ensureDefaultBranch(scope);
  let n = 0;
  for (const s of setup.stations) {
    const kind = (STATION_KINDS as readonly string[]).includes(s.type) ? (s.type as (typeof STATION_KINDS)[number]) : "other";
    for (let i = 1; i <= s.count; i++) {
      if (typeof maxStations === "number" && n >= maxStations) break;
      await scope.insert(t.stations, { branchId: branch.id, name: `${STATION_KIND_LABELS[kind]} ${i}`, kind, position: n++ });
    }
  }
  if (setup.hourlyPrice && !(await scope.count(t.loungeRates))) await scope.insert(t.loungeRates, { name: "سعر الساعة", mode: "hour", price: setup.hourlyPrice });
  return n;
}

// ===== الصيانة =====

export async function openMaintenance(scope: StoreScope, input: { stationId: string; issue: string; cost?: number }, actorUserId: string | null): Promise<Result> {
  const issue = String(input.issue ?? "").trim();
  if (issue.length < 2 || issue.length > 200) return fail("اكتب وصف العطل.");
  const cost = Math.max(0, Math.round(Number(input.cost) || 0));
  const [st] = await scope.from(t.stations, eq(t.stations.id, input.stationId)).limit(1);
  if (!st) return fail("ما لقينا الجهاز.");
  await scope.insert(t.stationMaintenance, { stationId: st.id, issue, cost, actorUserId, openedAt: new Date() });
  await scope.update(t.stations, { status: "maintenance" }, eq(t.stations.id, st.id));
  return ok(undefined);
}

export async function closeMaintenance(scope: StoreScope, id: string, cost: number | null): Promise<Result> {
  const [m] = await scope.from(t.stationMaintenance, eq(t.stationMaintenance.id, id)).limit(1);
  if (!m || m.status === "closed") return fail("ما لقينا العطل أو اتقفل قبل.");
  await scope.update(t.stationMaintenance, { status: "closed", closedAt: new Date(), ...(cost !== null && cost >= 0 ? { cost: Math.round(cost) } : {}) }, eq(t.stationMaintenance.id, id));
  const still = await scope.count(t.stationMaintenance, and(eq(t.stationMaintenance.stationId, m.stationId), eq(t.stationMaintenance.status, "open"))!);
  if (!still) await scope.update(t.stations, { status: "active" }, eq(t.stations.id, m.stationId));
  return ok(undefined);
}

export async function maintenanceLog(scope: StoreScope, limit = 50) {
  const [rows, st] = await Promise.all([scope.from(t.stationMaintenance).orderBy(desc(t.stationMaintenance.openedAt)).limit(limit), scope.from(t.stations)]);
  return rows.map((m) => ({ ...m, station: st.find((s) => s.id === m.stationId)?.name ?? "؟" }));
}

// ===== الأسعار والباقات =====

const rateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "اكتب اسم للسعر").max(40),
  mode: z.enum(["hour", "match"]),
  stationKind: z.enum(STATION_KINDS).nullish().transform((v) => v ?? null),
  room: z.enum(["normal", "vip"]).nullish().transform((v) => v ?? null),
  controllers: z.number().int().min(1).max(8).nullish().transform((v) => v ?? null),
  price: money,
  days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  fromMinute: z.number().int().min(0).max(1439).default(0),
  toMinute: z.number().int().min(1).max(1440).default(1440),
  priority: z.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
});

export const listRates = (scope: StoreScope) => scope.from(t.loungeRates).orderBy(asc(t.loungeRates.mode), asc(t.loungeRates.createdAt));

export async function saveRate(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = rateSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...d } = p.data;
  if (d.fromMinute === d.toMinute) return fail("وقت البداية والنهاية نفس الشي.");
  if (id) {
    const [row] = await scope.update(t.loungeRates, d, eq(t.loungeRates.id, id));
    return row ? ok({ id: row.id }) : fail("ما لقينا السعر.");
  }
  const [row] = await scope.insert(t.loungeRates, d);
  return ok({ id: row!.id });
}

export async function deleteRate(scope: StoreScope, id: string): Promise<Result> {
  const rows = await scope.delete(t.loungeRates, eq(t.loungeRates.id, id));
  return rows.length ? ok(undefined) : fail("ما لقينا السعر.");
}

const packSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "اكتب اسم الباقة").max(40),
  minutes: z.number().int().min(15, "الباقة ربع ساعة على الأقل").max(100_000),
  price: money,
  isActive: z.boolean().default(true),
});
export const listPacks = (scope: StoreScope) => scope.from(t.loungePacks).orderBy(asc(t.loungePacks.minutes));
export async function savePack(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = packSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...d } = p.data;
  if (id) { const [row] = await scope.update(t.loungePacks, d, eq(t.loungePacks.id, id)); return row ? ok({ id: row.id }) : fail("ما لقينا الباقة."); }
  const [row] = await scope.insert(t.loungePacks, d);
  return ok({ id: row!.id });
}

// ===== الحجوزات =====

const bookingSchema = z.object({
  stationId: z.string().min(1, "اختار الجهاز"),
  name: z.string({ error: "اكتب الاسم" }).trim().min(2, "اكتب الاسم").max(60),
  phone: z.string().trim().min(6, "اكتب رقم الهاتف").max(20),
  startsAt: z.number().int().positive(),
  minutes: z.number().int().min(15, "ربع ساعة على الأقل").max(12 * 60, "الحجز 12 ساعة بالكثير"),
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
});

/** الحجوزات اللي فاتت مهلة تأخيرها تتعلم «ما جاش» */
async function expireLate(scope: StoreScope, now: number) {
  const [settings] = await scope.from(t.storeSettings).limit(1);
  const grace = (posConfigOf(settings?.posConfig).lounge?.bookingGrace ?? 15) * MIN;
  const late = await scope.from(t.loungeBookings, and(inArray(t.loungeBookings.status, ["pending", "confirmed"]), lte(t.loungeBookings.startsAt, new Date(now - grace)))!);
  if (late.length) await scope.update(t.loungeBookings, { status: "no_show" }, inArray(t.loungeBookings.id, late.map((b) => b.id)));
}

export async function createBooking(scope: StoreScope, input: unknown, source: "dashboard" | "public", now = Date.now()): Promise<Result<{ id: string; message: string }>> {
  const p = bookingSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const phone = normalizeLibyanPhone(p.data.phone);
  if (!phone) return fail("رقم الهاتف مش رقم ليبي صحيح.");
  if (p.data.startsAt < now - 5 * MIN) return fail("وقت الحجز فات.");
  if (p.data.startsAt > now + 60 * 86_400_000) return fail("الحجز لحد شهرين بالكثير.");
  const [st] = await scope.from(t.stations, and(eq(t.stations.id, p.data.stationId), eq(t.stations.isActive, true))!).limit(1);
  if (!st) return fail("الجهاز غير موجود.");
  if (st.status === "maintenance") return fail("الجهاز في الصيانة. اختار جهاز ثاني.");
  await expireLate(scope, now);
  const want = { startsAt: p.data.startsAt, endsAt: p.data.startsAt + p.data.minutes * MIN };
  const others = await scope.from(t.loungeBookings, and(eq(t.loungeBookings.stationId, st.id), inArray(t.loungeBookings.status, ["pending", "confirmed", "arrived"]))!);
  if (others.some((b) => overlaps(want, { startsAt: b.startsAt.getTime(), endsAt: b.endsAt.getTime() }))) return fail("الجهاز محجوز في الوقت هذا. اختار وقت أو جهاز ثاني.");
  const [customer] = await scope.from(t.customers, eq(t.customers.phone, phone)).limit(1);
  const [row] = await scope.insert(t.loungeBookings, {
    stationId: st.id, customerId: customer?.id ?? null, name: p.data.name, phone, startsAt: new Date(want.startsAt), endsAt: new Date(want.endsAt),
    status: source === "dashboard" ? "confirmed" : "pending", source, note: p.data.note,
  });
  return ok({ id: row!.id, message: bookingMessage({ name: p.data.name, station: st.name, startsAt: want.startsAt, minutes: p.data.minutes }) });
}

export const bookingMessage = (b: { name: string; station: string; startsAt: number; minutes: number; shop?: string }) =>
  `مرحبا ${b.name}، حجزك${b.shop ? ` في ${b.shop}` : ""} مأكد ✅\nالجهاز: ${b.station}\nالوقت: ${formatDateTime(b.startsAt)} (${b.minutes} دقيقة)\nلو تأخرت أكثر من ربع ساعة الحجز يتلغى. نستنوك!`;

export async function setBookingStatus(scope: StoreScope, id: string, status: "confirmed" | "cancelled" | "arrived" | "no_show"): Promise<Result> {
  const rows = await scope.update(t.loungeBookings, { status }, eq(t.loungeBookings.id, id));
  return rows.length ? ok(undefined) : fail("ما لقينا الحجز.");
}

export async function listBookings(scope: StoreScope, range: { from: number; to: number }, now = Date.now()) {
  await expireLate(scope, now);
  const [rows, st] = await Promise.all([
    scope.from(t.loungeBookings, and(gte(t.loungeBookings.startsAt, new Date(range.from)), lte(t.loungeBookings.startsAt, new Date(range.to)))!).orderBy(asc(t.loungeBookings.startsAt)),
    scope.from(t.stations),
  ]);
  return rows.map((b) => ({ ...b, station: st.find((s) => s.id === b.stationId)?.name ?? "؟", startsAtMs: b.startsAt.getTime(), endsAtMs: b.endsAt.getTime() }));
}

// ===== حالة الصالة =====

export type FloorStation = {
  id: string; name: string; kind: string; kindLabel: string; room: string; color: string | null; games: string[];
  status: "available" | "busy" | "paused" | "ending" | "unpaid" | "maintenance"; remaining: number | null; since: number | null; hourPrice: number | null; nextBooking: number | null;
};

/** حالة كل جهاز الحين (متاح/شغال/موقوف/قرب يخلص/مش مدفوع/صيانة) والوقت الباقي */
export async function floorStatus(scope: StoreScope, now = Date.now()): Promise<FloorStation[]> {
  const [{ stationRows, stations, rates }, sessions, bookings, settings] = await Promise.all([
    loungeData(scope),
    scope.from(t.loungeSessions, inArray(t.loungeSessions.status, ["running", "paused", "ended"])),
    scope.from(t.loungeBookings, and(inArray(t.loungeBookings.status, ["pending", "confirmed"]), gte(t.loungeBookings.endsAt, new Date(now)))!),
    scope.from(t.storeSettings).limit(1),
  ]);
  const rules = posConfigOf(settings[0]?.posConfig).lounge ?? { ...DEFAULT_LOUNGE_RULES, bookingGrace: 15 };
  return stationRows.filter((s) => s.isActive).map((s) => {
    const sess = sessions.find((x) => x.stationId === s.id);
    const hour = rateAt(rates, { mode: "hour", kind: s.kind, room: s.room, controllers: 2 }, now) ?? rateAt(rates, { mode: "hour", kind: s.kind, room: s.room, controllers: 1 }, now);
    let status: FloorStation["status"] = s.status === "maintenance" ? "maintenance" : "available";
    let remaining: number | null = null;
    if (sess) {
      const st = sessionState(sess.events);
      const c = sessionCharge(st, stations, rates, rules, now);
      const per = rateAt(rates, { mode: "hour", kind: s.kind, room: s.room, controllers: st.controllers }, now)?.price ?? null;
      remaining = remainingMinutes(st, c, per);
      status = st.status === "ended" ? "unpaid" : st.status === "paused" ? "paused" : remaining !== null && remaining <= 5 ? "ending" : "busy";
    }
    const next = bookings.filter((b) => b.stationId === s.id).map((b) => b.startsAt.getTime()).sort((a, b) => a - b)[0] ?? null;
    return { id: s.id, name: s.name, kind: s.kind, kindLabel: STATION_KIND_LABELS[s.kind], room: s.room, color: s.color, games: s.games, status, remaining, since: sess ? sess.startedAt.getTime() : null, hourPrice: hour?.price ?? null, nextBooking: next };
  });
}

export async function recentSessions(scope: StoreScope, limit = 50) {
  const [rows, st] = await Promise.all([scope.from(t.loungeSessions).orderBy(desc(t.loungeSessions.startedAt)).limit(limit), scope.from(t.stations)]);
  return rows.map((s) => ({ id: s.id, station: st.find((x) => x.id === s.stationId)?.name ?? "؟", status: s.status, mode: s.mode, minutes: s.minutes, matches: s.matches, charge: s.charge, startedAt: s.startedAt.getTime(), saleId: s.saleId }));
}

// ===== البطولات =====

const tournamentSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(2, "اكتب اسم البطولة").max(60),
  game: z.string().trim().min(1, "اكتب اللعبة").max(40),
  format: z.enum(["knockout", "league"]),
  maxPlayers: z.number().int().min(2, "لاعبين على الأقل").max(128),
  entryFee: money.default(0),
  prizes: z.string().trim().max(300).nullish().transform((v) => v || null),
  startsAt: z.number().int().positive().nullish().transform((v) => v ?? null),
  publicSignup: z.boolean().default(true),
});

export async function saveTournament(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = tournamentSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, startsAt, ...d } = p.data;
  const row = { ...d, startsAt: startsAt ? new Date(startsAt) : null };
  if (id) {
    const [cur] = await scope.from(t.tournaments, eq(t.tournaments.id, id)).limit(1);
    if (!cur) return fail("ما لقينا البطولة.");
    if (cur.status !== "registration") return fail("البطولة بدت: ما تتعدلش.");
    await scope.update(t.tournaments, row, eq(t.tournaments.id, id));
    return ok({ id });
  }
  const [r] = await scope.insert(t.tournaments, row);
  return ok({ id: r!.id });
}

export async function listTournaments(scope: StoreScope, opts: { publicOnly?: boolean } = {}) {
  const [rows, players] = await Promise.all([scope.from(t.tournaments, ne(t.tournaments.status, "cancelled")).orderBy(desc(t.tournaments.createdAt)), scope.from(t.tournamentPlayers)]);
  return rows.filter((r) => !opts.publicOnly || r.status !== "finished" || Date.now() - r.createdAt.getTime() < 30 * 86_400_000)
    .map((r) => ({ ...r, players: players.filter((p) => p.tournamentId === r.id).length, startsAtMs: r.startsAt?.getTime() ?? null }));
}

export async function joinTournament(scope: StoreScope, tournamentId: string, input: { name: string; phone: string }, opts: { public: boolean }): Promise<Result<{ id: string }>> {
  const name = String(input.name ?? "").trim().slice(0, 60);
  const phone = normalizeLibyanPhone(String(input.phone ?? ""));
  if (name.length < 2) return fail("اكتب الاسم.");
  if (!phone) return fail("رقم الهاتف مش رقم ليبي صحيح.");
  const [tr] = await scope.from(t.tournaments, eq(t.tournaments.id, tournamentId)).limit(1);
  if (!tr || tr.status !== "registration") return fail("التسجيل في البطولة مقفول.");
  if (opts.public && !tr.publicSignup) return fail("التسجيل في البطولة هذي من الصالة بس.");
  if ((await scope.count(t.tournamentPlayers, eq(t.tournamentPlayers.tournamentId, tr.id))) >= tr.maxPlayers) return fail("البطولة اكتملت.");
  try {
    const [row] = await scope.insert(t.tournamentPlayers, { tournamentId: tr.id, name, phone, paid: tr.entryFee === 0 });
    return ok({ id: row!.id });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("الرقم هذا مسجّل في البطولة.");
    throw e;
  }
}

export async function setPlayerPaid(scope: StoreScope, playerId: string, paid: boolean): Promise<Result> {
  const rows = await scope.update(t.tournamentPlayers, { paid }, eq(t.tournamentPlayers.id, playerId));
  return rows.length ? ok(undefined) : fail("ما لقينا اللاعب.");
}

export async function removePlayer(scope: StoreScope, playerId: string): Promise<Result> {
  const [p] = await scope.from(t.tournamentPlayers, eq(t.tournamentPlayers.id, playerId)).limit(1);
  if (!p) return fail("ما لقينا اللاعب.");
  const [tr] = await scope.from(t.tournaments, eq(t.tournaments.id, p.tournamentId)).limit(1);
  if (tr?.status !== "registration") return fail("البطولة بدت.");
  await scope.delete(t.tournamentPlayers, eq(t.tournamentPlayers.id, playerId));
  return ok(undefined);
}

/** القرعة: شجرة خروج المغلوب (ترتيب عشوائي) أو جدول الدوري */
export async function startTournament(scope: StoreScope, id: string, rand: () => number = Math.random): Promise<Result> {
  const [tr] = await scope.from(t.tournaments, eq(t.tournaments.id, id)).limit(1);
  if (!tr || tr.status !== "registration") return fail("البطولة بدت أو مش موجودة.");
  const players = (await scope.from(t.tournamentPlayers, eq(t.tournamentPlayers.tournamentId, id))).filter((p) => p.paid);
  if (players.length < 2) return fail("تحتاج لاعبين دافعين على الأقل.");
  const ids = players.map((p) => p.id).map((v) => ({ v, r: rand() })).sort((a, b) => a.r - b.r).map((x) => x.v);
  const slots = tr.format === "knockout" ? knockoutBracket(ids) : leagueSchedule(ids);
  return scope.transaction(async (tx) => {
    await tx.insert(t.tournamentMatches, slots.map((s) => ({ tournamentId: id, ...s })));
    await tx.update(t.tournaments, { status: "running" }, eq(t.tournaments.id, id));
    return ok(undefined);
  });
}

export async function recordMatch(scope: StoreScope, id: string, round: number, slot: number, score1: number, score2: number): Promise<Result<{ finished: boolean }>> {
  if (![score1, score2].every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) return fail("النتيجة غير صحيحة.");
  const [tr] = await scope.from(t.tournaments, eq(t.tournaments.id, id)).limit(1);
  if (!tr || tr.status !== "running") return fail("البطولة مش شغالة.");
  const rows = await scope.from(t.tournamentMatches, eq(t.tournamentMatches.tournamentId, id));
  const slots: Slot[] = rows.map((r) => ({ round: r.round, slot: r.slot, player1Id: r.player1Id, player2Id: r.player2Id, score1: r.score1, score2: r.score2, winnerId: r.winnerId }));
  let next: Slot[];
  if (tr.format === "knockout") {
    const r = setResult(slots, round, slot, score1, score2);
    if (!r.ok) return fail(r.error);
    next = r.slots;
  } else {
    const m = slots.find((x) => x.round === round && x.slot === slot);
    if (!m) return fail("الماتش غير موجود.");
    m.score1 = score1; m.score2 = score2; m.winnerId = score1 > score2 ? m.player1Id : score2 > score1 ? m.player2Id : null;
    next = slots;
  }
  return scope.transaction(async (tx) => {
    for (const s of next) {
      const old = rows.find((r) => r.round === s.round && r.slot === s.slot)!;
      if (old.player1Id !== s.player1Id || old.player2Id !== s.player2Id || old.score1 !== s.score1 || old.score2 !== s.score2 || old.winnerId !== s.winnerId) {
        await tx.update(t.tournamentMatches, { player1Id: s.player1Id, player2Id: s.player2Id, score1: s.score1, score2: s.score2, winnerId: s.winnerId }, eq(t.tournamentMatches.id, old.id));
      }
    }
    const finished = tr.format === "knockout" ? !!championOf(next) : next.every((s) => s.score1 !== null && s.score2 !== null);
    if (finished) await tx.update(t.tournaments, { status: "finished" }, eq(t.tournaments.id, id));
    return ok({ finished });
  });
}

export async function getTournament(scope: StoreScope, id: string) {
  const [tr] = await scope.from(t.tournaments, eq(t.tournaments.id, id)).limit(1);
  if (!tr) return null;
  const [players, matches] = await Promise.all([
    scope.from(t.tournamentPlayers, eq(t.tournamentPlayers.tournamentId, id)).orderBy(asc(t.tournamentPlayers.createdAt)),
    scope.from(t.tournamentMatches, eq(t.tournamentMatches.tournamentId, id)).orderBy(asc(t.tournamentMatches.round), asc(t.tournamentMatches.slot)),
  ]);
  const name = new Map(players.map((p) => [p.id, p.name]));
  const slots: Slot[] = matches.map((m) => ({ round: m.round, slot: m.slot, player1Id: m.player1Id, player2Id: m.player2Id, score1: m.score1, score2: m.score2, winnerId: m.winnerId }));
  const champion = tr.format === "knockout" && slots.length ? championOf(slots) : null;
  return {
    ...tr, startsAtMs: tr.startsAt?.getTime() ?? null,
    players: players.map((p) => ({ id: p.id, name: p.name, phone: p.phone, paid: p.paid })),
    matches: matches.map((m) => ({ ...m, p1: m.player1Id ? name.get(m.player1Id) ?? "؟" : null, p2: m.player2Id ? name.get(m.player2Id) ?? "؟" : null })),
    table: tr.format === "league" ? standings(players.filter((p) => p.paid).map((p) => p.id), slots).map((s) => ({ ...s, name: name.get(s.playerId) ?? "؟" })) : [],
    champion: champion ? name.get(champion) ?? null : null,
  };
}

// ===== إعدادات الحساب =====

const rulesSchema = z.object({
  roundTo: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15)]),
  minMinutes: z.number().int().min(0).max(240),
  startFee: money,
  bookingGrace: z.number().int().min(0).max(120),
});

export async function saveLoungeRules(scope: StoreScope, input: unknown): Promise<Result> {
  const p = rulesSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const [cur] = await scope.from(t.storeSettings).limit(1);
  await scope.update(t.storeSettings, { posConfig: { ...(cur?.posConfig ?? {}), lounge: p.data } });
  return ok(undefined);
}

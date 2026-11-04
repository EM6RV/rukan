"use server";

import { revalidatePath } from "next/cache";
import type { Feature } from "@/lib/entitlements";
import { canUse } from "@/lib/entitlements";
import { fail, type Result } from "@/server/catalog/result";
import { createDevice, ensureDefaultBranch, revokeDevice } from "@/server/pos/branches";
import {
  closeMaintenance, createBooking, deleteRate, joinTournament, openMaintenance, recordMatch, removePlayer, saveLoungeRules, savePack, saveRate, saveStation,
  saveTournament, setBookingStatus, setPlayerPaid, startTournament,
} from "@/server/lounge/service";
import type { Permission } from "@/server/permissions";
import { auditStore } from "@/server/store-audit";
import { lineActionContext, type StoreContext } from "@/server/store-context";

const LOCKED: Partial<Record<Feature, string>> = {
  bookings: "الحجوزات مش في باقة رُكن بلاي الحالية.",
  hourPacks: "باقات الساعات مش في باقة رُكن بلاي الحالية.",
  wallScreen: "شاشة الحائط مش في باقة رُكن بلاي الحالية.",
  tournaments: "البطولات مش في باقة رُكن بلاي الحالية.",
};

async function run<T>(perm: Permission, action: string, fn: (ctx: StoreContext) => Promise<Result<T>>, feature?: Feature): Promise<Result<T>> {
  const auth = await lineActionContext("lounge", perm, { write: true });
  if (!auth.ok) return auth;
  if (feature && !canUse(auth.ctx.lines.lounge.limits ?? {}, feature)) return fail(LOCKED[feature] ?? "الميزة هذي مش في باقتك.");
  const r = await fn(auth.ctx);
  if (r.ok) { void auditStore(auth.ctx, action); revalidatePath("/dashboard/lounge", "layout"); }
  return r;
}

export async function saveStationAction(input: unknown) {
  return run("settings", "lounge.station", (c) => saveStation(c.scope, c.lines.lounge.limits?.maxStations ?? null, input));
}
export async function openMaintenanceAction(input: { stationId: string; issue: string; cost?: number }) {
  return run("settings", "lounge.maintenance", (c) => openMaintenance(c.scope, { stationId: String(input?.stationId ?? ""), issue: String(input?.issue ?? ""), cost: Number(input?.cost) || 0 }, c.user.id));
}
export async function closeMaintenanceAction(id: string, cost: number | null) {
  return run("settings", "lounge.maintenance_close", (c) => closeMaintenance(c.scope, String(id), cost === null ? null : Number(cost)));
}
export async function saveRateAction(input: unknown) { return run("settings", "lounge.rate", (c) => saveRate(c.scope, input)); }
export async function deleteRateAction(id: string) { return run("settings", "lounge.rate_delete", (c) => deleteRate(c.scope, String(id))); }
export async function saveRulesAction(input: unknown) { return run("settings", "lounge.rules", (c) => saveLoungeRules(c.scope, input)); }
export async function savePackAction(input: unknown) { return run("settings", "lounge.pack", (c) => savePack(c.scope, input), "hourPacks"); }

export async function createBookingAction(input: unknown) { return run("customers", "lounge.booking", (c) => createBooking(c.scope, input, "dashboard"), "bookings"); }
export async function bookingStatusAction(id: string, status: "confirmed" | "cancelled" | "arrived" | "no_show") {
  if (!["confirmed", "cancelled", "arrived", "no_show"].includes(status)) return fail("حالة غير صحيحة.");
  return run("customers", "lounge.booking_status", (c) => setBookingStatus(c.scope, String(id), status), "bookings");
}

export async function saveTournamentAction(input: unknown) { return run("marketing", "lounge.tournament", (c) => saveTournament(c.scope, input), "tournaments"); }
export async function addPlayerAction(tournamentId: string, input: { name: string; phone: string }) {
  return run("marketing", "lounge.tournament_player", (c) => joinTournament(c.scope, String(tournamentId), { name: String(input?.name ?? ""), phone: String(input?.phone ?? "") }, { public: false }), "tournaments");
}
export async function playerPaidAction(playerId: string, paid: boolean) { return run("marketing", "lounge.tournament_paid", (c) => setPlayerPaid(c.scope, String(playerId), !!paid), "tournaments"); }
export async function removePlayerAction(playerId: string) { return run("marketing", "lounge.tournament_player_remove", (c) => removePlayer(c.scope, String(playerId)), "tournaments"); }
export async function startTournamentAction(id: string) { return run("marketing", "lounge.tournament_start", (c) => startTournament(c.scope, String(id)), "tournaments"); }
export async function matchResultAction(id: string, round: number, slot: number, s1: number, s2: number) {
  return run("marketing", "lounge.tournament_result", (c) => recordMatch(c.scope, String(id), Number(round), Number(slot), Number(s1), Number(s2)), "tournaments");
}

/** رابط شاشة حائط جديد (توكن جهاز بصلاحية العرض بس) */
export async function createWallScreenAction(name: string): Promise<Result<{ token: string }>> {
  return run("settings", "lounge.wall_screen", async (c) => {
    const branch = await ensureDefaultBranch(c.scope);
    const r = await createDevice(c.scope, { kind: "wall", line: "lounge", name: String(name || "شاشة الحائط").slice(0, 40), branchId: branch.id }, c.user.id);
    return r.ok ? { ok: true, data: { token: r.data.token } } : r;
  }, "wallScreen");
}
export async function revokeWallScreenAction(id: string) { return run("settings", "lounge.wall_revoke", (c) => revokeDevice(c.scope, String(id))); }

/** يجهز الأجهزة والسعر من إعداد التسجيل (مرة وحدة) */
export async function seedStationsAction() {
  return run("settings", "lounge.seed_stations", async (c) => {
    const { lineSetups } = await import("@/server/lines");
    const { getDb } = await import("@/db");
    const { seedStationsFromSetup } = await import("@/server/lounge/service");
    const setup = (await lineSetups(getDb(), c.store.id)).lounge?.lounge;
    const n = await seedStationsFromSetup(c.scope, setup, c.lines.lounge.limits?.maxStations ?? null);
    return n ? { ok: true as const, data: { created: n } } : fail("ما فيش إعداد مبدئي أو الأجهزة موجودة.");
  });
}

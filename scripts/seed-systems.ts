// بيانات تجريبية للمنظومات الثلاث (أسماء وهمية): pnpm exec tsx scripts/seed-systems.ts
// ماركت: 300 صنف + دفعات + ديون | بلاي: 10 أجهزة + جلسات + بطولة | فِت: 200 عضو + حصص + مدربين
import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { stores, users } from "../src/db/schema/platform";
import { getEnv } from "../src/lib/env";
import { hashPassword } from "../src/server/auth/password";
import { saveProduct } from "../src/server/catalog/products";
import { saveCategory } from "../src/server/catalog/categories";
import { addBatch } from "../src/server/market/batches";
import { joinTournament, saveRate, saveStation, saveTournament } from "../src/server/lounge/service";
import { saveClass, saveMember, savePlan, saveTrainer, subscribe, checkin } from "../src/server/gym/service";
import { postCustomer, upsertCustomer } from "../src/server/pos/customers";
import { ensureDefaultBranch } from "../src/server/pos/branches";
import { createStoreForUser } from "../src/server/store-service";
import { forStore, t } from "../src/server/tenant";
import { PRO_LIMITS } from "../src/lib/plan-catalog";
import type { ProductLine } from "../src/lib/product-lines";

const env = getEnv();
const { db, client } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
const PASSWORD = "demo-password-123";
const DAY = 86_400_000;
let seed = 7;
const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const must = <T extends { ok: boolean }>(r: T, what: string): T & { ok: true } => { if (!r.ok) throw new Error(`${what}: ${(r as unknown as { error: string }).error}`); return r as never; };

async function store(slug: string, name: string, phone: string, line: ProductLine) {
  const existing = await db.select().from(stores).where(eq(stores.slug, slug)).get();
  if (existing) { console.log(`↷ ${slug} موجود، تخطيت`); return null; }
  const [u] = await db.insert(users).values({ phone, name: `مالك ${name}`, passwordHash: await hashPassword(PASSWORD) }).returning();
  const r = must(await createStoreForUser(db, { userId: u!.id, name, slug, lines: [line] }), "store");
  await db.update(stores).set({ onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  return forStore(db, r.data.storeId);
}

// ===== ماركت =====
const AISLES = ["ألبان وأجبان", "مخبوزات", "معلبات", "مشروبات", "منظفات", "حلويات وسناكس", "زيوت وبقوليات", "عناية شخصية"];
const ITEMS = ["نخيل", "واحة", "سنبلة", "الغدير", "زيتونة", "الوفرة", "ميزان", "بركة", "سحاب", "نسيم"];
const m = await store("baraka-market", "ماركت البركة", "0911000101", "market");
if (m) {
  const cats: string[] = [];
  for (const c of AISLES) { const r = must(await saveCategory(m, { name: c }), "cat") as unknown as { data: { id: string } }; cats.push(r.data.id); }
  for (let i = 0; i < 300; i++) {
    const price = 500 + rnd(30) * 250;
    const r = await saveProduct(m, { name: `${AISLES[i % 8]!.split(" ")[0]} ${ITEMS[i % 10]} ${i + 1}`, description: "صنف تجريبي", price, costPrice: Math.round(price * 0.75), isVisible: true, isFeatured: i % 37 === 0, categoryIds: [cats[i % 8]!], imageMediaIds: [], options: [], variants: [{ valueIds: [], stock: 20 + rnd(80) }] }, { limits: PRO_LIMITS });
    must(r, `product ${i}`);
  }
  const variants = await m.from(t.productVariants);
  for (let i = 0; i < 120; i++) must(await addBatch(m, { variantId: variants[i]!.id, batchNo: `B-${1000 + i}`, expiresAt: Date.now() + (i % 40 - 5) * DAY, quantity: 10 + rnd(40) }), "batch");
  for (let i = 0; i < 25; i++) {
    const c = await upsertCustomer(m, { phone: `091200${String(1000 + i)}`, name: `زبون ${i + 1}` });
    await postCustomer(m, { customerId: c.id, account: "debt", amount: 5_000 + rnd(200) * 500, kind: "sale", actorUserId: null, at: Date.now() - rnd(60) * DAY, note: "بيع على الحساب" });
  }
  console.log("✓ baraka-market: 300 صنف + 120 دفعة + 25 دين");
}

// ===== بلاي =====
const l = await store("nabd-play", "صالة نبض للألعاب", "0911000102", "lounge");
if (l) {
  const branch = await ensureDefaultBranch(l);
  const kinds = ["ps5", "ps5", "ps5", "ps5", "ps4", "ps4", "pc", "pc", "ps5", "ps5"] as const;
  const ids: string[] = [];
  for (let i = 0; i < 10; i++) ids.push((must(await saveStation(l, null, { name: `جهاز ${i + 1}`, kind: kinds[i], room: i >= 8 ? "vip" : "normal", games: ["FC 25", "UFC", "Tekken"] }), "station") as unknown as { data: { id: string } }).data.id);
  for (const k of ["ps5", "ps4", "pc"] as const) must(await saveRate(l, { name: `ساعة ${k}`, mode: "hour", stationKind: k, price: k === "ps5" ? 10_000 : 7_000, priority: 1 }), "rate");
  for (let i = 0; i < 40; i++) {
    const start = Date.now() - rnd(14) * DAY - rnd(10) * 3_600_000, minutes = 30 + rnd(8) * 15;
    await l.insert(t.loungeSessions, { branchId: branch.id, stationId: ids[rnd(10)]!, mode: "hour", limitKind: "open", limitValue: null, status: "paid", events: [], startedAt: new Date(start), endedAt: new Date(start + minutes * 60_000), minutes, charge: Math.round((minutes / 60) * 10_000 / 500) * 500 });
  }
  const tr = must(await saveTournament(l, { name: "بطولة نبض FC", game: "FC 25", format: "knockout", maxPlayers: 8, entryFee: 5_000, publicSignup: true, startsAt: Date.now() + 3 * DAY }), "tour") as unknown as { data: { id: string } };
  for (let i = 0; i < 6; i++) must(await joinTournament(l, tr.data.id, { name: `لاعب ${i + 1}`, phone: `091300${1000 + i}` }, { public: false }), "join");
  console.log("✓ nabd-play: 10 أجهزة + 40 جلسة + بطولة بـ 6 لاعبين");
}

// ===== فِت =====
const g = await store("quwa-fit", "نادي القوة", "0911000103", "gym");
if (g) {
  const plan = async (x: object) => (must(await savePlan(g, x), "plan") as unknown as { data: { id: string } }).data.id;
  const monthly = await plan({ name: "شهري", kind: "duration", days: 30, price: 40_000, joinFee: 5_000, maxFreezeDays: 7 });
  const quarter = await plan({ name: "3 شهور", kind: "duration", days: 90, price: 100_000, maxFreezeDays: 15 });
  const trainers: string[] = [];
  for (const n of ["كابتن سالم", "كابتن منى", "كابتن إدريس"]) trainers.push((must(await saveTrainer(g, { name: n, specialty: "لياقة وبناء أجسام", commissionKind: "percent", commissionValue: 40 }), "trainer") as unknown as { data: { id: string } }).data.id);
  for (const [i, n] of ["زومبا", "كروس فِت", "يوغا", "كارديو"].entries()) must(await saveClass(g, { name: n, trainerId: trainers[i % 3], weekday: (i * 2) % 7, startMinute: 18 * 60, durationMin: 60, capacity: 15 }), "class");
  const ids: string[] = [];
  for (let i = 0; i < 200; i++) {
    const mem = must(await saveMember(g, null, { name: `عضو ${i + 1}`, phone: `091400${String(1000 + i)}`, section: i % 4 === 0 ? "women" : "men", termsAccepted: true }), "member") as unknown as { data: { id: string } };
    ids.push(mem.data.id);
    const long = i % 3 === 0;
    must(await subscribe(g, { memberId: mem.data.id, planId: long ? quarter : monthly, startsAt: Date.now() - rnd(35) * DAY, paid: long ? 50_000 : 45_000, installments: long ? 2 : 0 }, { actorUserId: null, accounting: false }), "subscribe");
  }
  for (const id of ids.slice(0, 40)) await checkin(g, (await g.from(t.gymMembers).then((r) => r.find((x) => x.id === id)!.phone)), "manual");
  console.log("✓ quwa-fit: 200 عضو + 3 مدربين + 4 حصص + اشتراكات وأقساط");
}

console.log(`\nتم. كلمة السر للحسابات: ${PASSWORD} — baraka-market 0911000101 | nabd-play 0911000102 | quwa-fit 0911000103`);
client.close();

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { stores } from "@/db/schema/platform";
import { FALLBACK_LIMITS } from "@/lib/plan-limits";
import { isModuleOn, moduleState, setModuleEnabled } from "@/server/modules";
import { makeStore, makeTestDb } from "./helpers/db";

let db: Db, close: () => void;
beforeAll(async () => { ({ db, close } = await makeTestDb()); });
afterAll(() => close());

const enabled = async (id: string) => (await db.select({ v: stores.enabledModules }).from(stores).where(eq(stores.id, id)))[0]!.v;
const AVAIL = ["warehouses", "accounting"] as const;
const noWarehouses = { ...FALLBACK_LIMITS, modules: { warehouses: false } };

describe("الوحدات الاختيارية", () => {
  it("مطفية افتراضياً، وتتشغّل وتنطفى بدون ما تمس الوحدات الثانية", async () => {
    const { store } = await makeStore(db, "md-1");
    expect(await enabled(store.id)).toEqual([]);
    expect((await setModuleEnabled(db, store, FALLBACK_LIMITS, { key: "warehouses", on: true }, AVAIL)).ok).toBe(true);
    const s1 = { ...store, enabledModules: await enabled(store.id) };
    expect(s1.enabledModules).toEqual(["warehouses"]);
    expect(isModuleOn(s1, FALLBACK_LIMITS, "warehouses", AVAIL)).toBe(true);
    await setModuleEnabled(db, s1, FALLBACK_LIMITS, { key: "accounting", on: true }, AVAIL);
    const s2 = { ...store, enabledModules: await enabled(store.id) };
    await setModuleEnabled(db, s2, FALLBACK_LIMITS, { key: "warehouses", on: false }, AVAIL);
    expect(await enabled(store.id)).toEqual(["accounting"]);
  });

  it("لكل متجر لوحده", async () => {
    const a = (await makeStore(db, "md-a")).store;
    const b = (await makeStore(db, "md-b")).store;
    await setModuleEnabled(db, a, FALLBACK_LIMITS, { key: "accounting", on: true }, AVAIL);
    expect(await enabled(a.id)).toEqual(["accounting"]);
    expect(await enabled(b.id)).toEqual([]);
  });

  it("الوحدة اللي مش مبنية (قريباً) ما تتفعلش", async () => {
    const { store } = await makeStore(db, "md-soon");
    const r = await setModuleEnabled(db, store, FALLBACK_LIMITS, { key: "purchasing", on: true }, AVAIL);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("قريباً") });
    expect(await enabled(store.id)).toEqual([]);
    expect(moduleState(["purchasing"], FALLBACK_LIMITS, "purchasing", AVAIL)).toBe("soon");
  });

  it("الوحدة اللي مش في الباقة مقفولة: ما تتفعلش، ولو كانت مفعّلة من قبل ما تشتغلش", async () => {
    const { store } = await makeStore(db, "md-lock");
    const r = await setModuleEnabled(db, store, noWarehouses, { key: "warehouses", on: true }, AVAIL);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("باقتك") });
    expect(moduleState(["warehouses"], noWarehouses, "warehouses", AVAIL)).toBe("locked");
    expect(isModuleOn({ enabledModules: ["warehouses"] }, noWarehouses, "warehouses", AVAIL)).toBe(false);
    // الطفي مسموح حتى لو مقفولة (باش ينظف اختياره)
    expect((await setModuleEnabled(db, { ...store, enabledModules: ["warehouses"] }, noWarehouses, { key: "warehouses", on: false }, AVAIL)).ok).toBe(true);
  });

  it("رفض مدخلات غلط", async () => {
    const { store } = await makeStore(db, "md-bad");
    for (const input of [{}, { key: "x", on: true }, { key: "warehouses", on: "yes" }, null]) {
      expect(await setModuleEnabled(db, store, FALLBACK_LIMITS, input, AVAIL)).toEqual({ ok: false, error: expect.any(String) });
    }
  });

  it("بدون وحدات مبنية: كل الوحدات «قريباً»", () => {
    expect(moduleState([], FALLBACK_LIMITS, "warehouses")).toBe("soon");
  });
});

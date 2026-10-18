import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { stores } from "@/db/schema/platform";
import { saveCouriersSetting } from "@/server/settings-service";
import { makeStore, makeTestDb } from "./helpers/db";

let db: Db, close: () => void;
beforeAll(async () => { ({ db, close } = await makeTestDb()); });
afterAll(() => close());

const flag = async (id: string) => (await db.select({ v: stores.useCouriers }).from(stores).where(eq(stores.id, id)))[0]!.v;

describe("المندوبين والكاش اختياري", () => {
  it("شغّال افتراضياً، ويتقفل ويرجع يتشغّل", async () => {
    const { store } = await makeStore(db, "cs-1");
    expect(await flag(store.id)).toBe(true);
    expect(await saveCouriersSetting(db, store.id, { useCouriers: false })).toEqual({ ok: true, data: undefined });
    expect(await flag(store.id)).toBe(false);
    expect((await saveCouriersSetting(db, store.id, { useCouriers: true })).ok).toBe(true);
    expect(await flag(store.id)).toBe(true);
  });

  it("لكل متجر لوحده", async () => {
    const a = (await makeStore(db, "cs-a")).store;
    const b = (await makeStore(db, "cs-b")).store;
    await saveCouriersSetting(db, a.id, { useCouriers: false });
    expect(await flag(a.id)).toBe(false);
    expect(await flag(b.id)).toBe(true);
  });

  it("رفض قيمة غلط", async () => {
    const { store } = await makeStore(db, "cs-bad");
    for (const input of [{}, { useCouriers: "no" }, { useCouriers: 0 }, null]) {
      expect(await saveCouriersSetting(db, store.id, input)).toEqual({ ok: false, error: expect.any(String) });
    }
    expect(await flag(store.id)).toBe(true);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { stores, users } from "@/db/schema/platform";
import { PRO_LIMITS } from "@/lib/plan-catalog";
import { INBOX_ADAPTERS, NotConnectedError } from "@/server/inbox/adapters";
import { closeConversation, ensureChannels, listChannels, listConversations, logManualConversation } from "@/server/inbox/service";
import { availableFor, moduleState } from "@/server/modules";
import { createStoreForUser } from "@/server/store-service";
import { forStore } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

let db: Db, close: () => void, n = 0;
beforeAll(async () => { ({ db, close } = await makeTestDb()); });
afterAll(() => close());

async function shop(slug: string) {
  const [u] = await db.insert(users).values({ phone: `0914${String(++n).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  return { id: r.data.storeId, scope: forStore(db, r.data.storeId) };
}

describe("صندوق الرسائل (هيكل «قريباً»)", () => {
  it("الوحدة قريباً للكل، وتفتح للمتجر اللي فعّلها له الأدمن فقط", async () => {
    const a = await shop("inb-a"), b = await shop("inb-b");
    await db.update(stores).set({ inboxBeta: true, enabledModules: ["marketplaceInbox"] }).where(eq(stores.id, a.id));
    const [sa] = await db.select().from(stores).where(eq(stores.id, a.id));
    const [sb] = await db.select().from(stores).where(eq(stores.id, b.id));
    expect(moduleState(["marketplaceInbox"], PRO_LIMITS, "marketplaceInbox", availableFor(sa!))).toBe("on");
    expect(moduleState(["marketplaceInbox"], PRO_LIMITS, "marketplaceInbox", availableFor(sb!))).toBe("soon");
  });

  it("القنوات الأربع غير مربوطة، والـ adapters ترفض، والمحادثات معزولة", async () => {
    const a = await shop("inb-c"), b = await shop("inb-d");
    expect((await ensureChannels(a.scope)).map((c) => c.kind).sort()).toEqual(["facebook", "instagram", "site", "whatsapp"]);
    expect((await listChannels(a.scope)).every((c) => c.status === "disconnected" && !c.ready)).toBe(true);
    await expect(INBOX_ADAPTERS.instagram.pull(null)).rejects.toBeInstanceOf(NotConnectedError);
    await expect(INBOX_ADAPTERS.whatsapp.send("x", "hi")).rejects.toThrow("غير مربوطة");

    const conv = await logManualConversation(a.scope, { kind: "whatsapp", name: "سالم", body: "بكم العطر؟" });
    if (!conv.ok) throw new Error(conv.error);
    expect(await listConversations(a.scope)).toMatchObject([{ name: "سالم", channel: "واتساب", status: "open" }]);
    expect(await listConversations(b.scope)).toEqual([]);
    expect((await closeConversation(b.scope, conv.data.id)).ok).toBe(false);
    expect((await closeConversation(a.scope, conv.data.id)).ok).toBe(true);
    expect(await logManualConversation(a.scope, { kind: "tiktok", name: "x", body: "y" })).toMatchObject({ ok: false });
  });
});

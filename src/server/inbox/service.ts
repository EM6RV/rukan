import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope } from "../tenant";
import { CHANNEL_LABELS, INBOX_ADAPTERS, type InboxChannelKind } from "./adapters";

const KINDS = Object.keys(CHANNEL_LABELS) as InboxChannelKind[];

/** القنوات الأربع تتجهز أوتوماتيك (غير مربوطة). */
export async function ensureChannels(scope: StoreScope) {
  const have = await scope.from(t.inboxChannels);
  const missing = KINDS.filter((k) => !have.some((c) => c.kind === k));
  if (missing.length) await scope.insert(t.inboxChannels, missing.map((kind) => ({ kind, label: CHANNEL_LABELS[kind] })));
  return scope.from(t.inboxChannels);
}

export async function listChannels(scope: StoreScope) {
  return (await ensureChannels(scope)).map((c) => ({ id: c.id, kind: c.kind, label: c.label, status: c.status, ready: INBOX_ADAPTERS[c.kind].isReady() }));
}

export async function listConversations(scope: StoreScope) {
  const [convs, channels] = await Promise.all([scope.from(t.inboxConversations).orderBy(desc(t.inboxConversations.lastMessageAt)).limit(100), scope.from(t.inboxChannels)]);
  const label = new Map(channels.map((c) => [c.id, c.label]));
  return convs.map((c) => ({ id: c.id, channel: label.get(c.channelId) ?? "؟", name: c.participantName, handle: c.participantHandle, status: c.status, unread: c.unreadCount, at: c.lastMessageAt.getTime(), orderId: c.orderId }));
}

export async function getThread(scope: StoreScope, id: string) {
  const [c] = await scope.from(t.inboxConversations, eq(t.inboxConversations.id, id)).limit(1);
  if (!c) return null;
  const msgs = await scope.from(t.inboxMessages, eq(t.inboxMessages.conversationId, id)).orderBy(t.inboxMessages.sentAt);
  return { id: c.id, name: c.participantName, status: c.status, messages: msgs.map((m) => ({ id: m.id, direction: m.direction, body: m.body, at: m.sentAt.getTime() })) };
}

const noteSchema = z.object({ kind: z.enum(["instagram", "facebook", "whatsapp", "site"]), name: z.string({ error: "اكتب اسم المحادثة" }).trim().min(1, "اكتب اسم المحادثة").max(80), body: z.string({ error: "اكتب الرسالة" }).trim().min(1, "اكتب الرسالة").max(2000) });

/** تسجيل محادثة يدوياً (لحين الربط الحقيقي): تتحفظ كمحادثة مفتوحة برسالة واردة */
export async function logManualConversation(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = noteSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const channel = (await ensureChannels(scope)).find((c) => c.kind === p.data.kind)!;
  const [conv] = await scope.insert(t.inboxConversations, { channelId: channel.id, participantName: p.data.name, unreadCount: 0 });
  await scope.insert(t.inboxMessages, { conversationId: conv!.id, direction: "in", body: p.data.body });
  return ok({ id: conv!.id });
}

export async function closeConversation(scope: StoreScope, id: string): Promise<Result> {
  const rows = await scope.update(t.inboxConversations, { status: "closed" }, eq(t.inboxConversations.id, id));
  return rows.length ? ok(undefined) : fail("ما لقينا المحادثة.");
}

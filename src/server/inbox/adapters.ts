// صندوق الرسائل: واجهة الـ adapters فقط. ما فيه ربط مع أي API توا (قرار لاحق بعد ما نتفق على المزودين والمفاتيح).
// كل قناة لها adapter فاضي يرمي NotConnected. لما نجهز الربط الحقيقي نكمل الدوال ونغيّر isReady.
export type InboxChannelKind = "instagram" | "facebook" | "whatsapp" | "site";
export type IncomingMessage = { threadId: string; participantName: string; participantHandle?: string; body: string; externalId: string; sentAt: number };

export class NotConnectedError extends Error {
  constructor(kind: InboxChannelKind) { super(`قناة ${CHANNEL_LABELS[kind]} غير مربوطة بعد.`); }
}

export interface InboxAdapter {
  kind: InboxChannelKind;
  isReady(): boolean;
  /** يجيب الرسائل الجديدة من القناة */
  pull(since: number | null): Promise<IncomingMessage[]>;
  /** يرسل ردّ لمحادثة */
  send(threadId: string, body: string): Promise<{ externalId: string }>;
}

export const CHANNEL_LABELS: Record<InboxChannelKind, string> = { instagram: "إنستغرام", facebook: "فيسبوك", whatsapp: "واتساب", site: "رسائل المتجر" };

const empty = (kind: InboxChannelKind): InboxAdapter => ({
  kind, isReady: () => false,
  async pull() { throw new NotConnectedError(kind); },
  async send() { throw new NotConnectedError(kind); },
});

export const INBOX_ADAPTERS: Record<InboxChannelKind, InboxAdapter> = {
  instagram: empty("instagram"), facebook: empty("facebook"), whatsapp: empty("whatsapp"), site: empty("site"),
};

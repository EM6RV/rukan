// رسائل واتساب التلقائية للنادي: قوالب قابلة للتعديل، وقائمة «رسائل اليوم» اللي الاستقبال يبعتها بضغطة (wa.me).
// واجهة WhatsApp Business API جاهزة كـ adapter فاضي لحد ما يتوفر اتفاق ومفاتيح.
import { desc, eq, gte } from "drizzle-orm";
import { daysLeft, libyaDay, libyaDayStart, overdueInstallments } from "@/lib/gym";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope } from "../tenant";
import { gymConfigOf } from "./service";

import { GYM_MESSAGE_KINDS, GYM_MESSAGE_LABELS, GYM_VARS, type GymMessageKind, type TodayMessage } from "./message-meta";
export { GYM_MESSAGE_KINDS, GYM_MESSAGE_LABELS, GYM_VARS };
export type { GymMessageKind, TodayMessage };
const DAY = 86_400_000;

export const DEFAULT_GYM_TEMPLATES: Record<GymMessageKind, string> = {
  expiring: "أهلاً {name}، اشتراكك في {store} يخلص بعد {days} يوم ({date}). جدّد من الاستقبال أو ردّ علينا هنا 💪",
  expired: "أهلاً {name}، انتهى اشتراكك في {store} بتاريخ {date}. نتمنى نشوفك قريب، جدّد وكمّل تمارينك!",
  installment: "أهلاً {name}، قسطك ({amount}) في {store} مستحق بتاريخ {date}. ادفعه من الاستقبال باش ما يتوقفش دخولك.",
  absent: "{name}، ما شفناك من {days} يوم في {store}! نبوك ترجع لتمارينك، النادي مستنيك 💪",
  birthday: "كل عام وانت بخير {name} 🎉 من أسرة {store}. هدية بسيطة بمناسبتك: كلّم الاستقبال.",
  welcome: "أهلاً بيك {name} في {store} 🎉 اشتراكك ({plan}) لحد {date}. قواعد النادي: النظافة، منشفة، وإحضار بطاقتك QR عند الدخول. نتمنى لك تمرين ممتع!",
  class_confirm: "{name}، تأكد حجزك في حصة {class} يوم {date} الساعة {time} في {store}. نستنوك!",
};
const key = (k: GymMessageKind) => `gym_${k}`;

export async function getGymTemplates(scope: Pick<StoreScope, "from">): Promise<Record<GymMessageKind, { body: string; isCustom: boolean }>> {
  const rows = await scope.from(t.whatsappTemplates);
  return Object.fromEntries(GYM_MESSAGE_KINDS.map((k) => { const r = rows.find((x) => x.key === key(k)); return [k, { body: r?.body ?? DEFAULT_GYM_TEMPLATES[k], isCustom: !!r }]; })) as never;
}
export async function saveGymTemplate(scope: StoreScope, input: { kind: string; body: string | null }): Promise<Result> {
  if (!(GYM_MESSAGE_KINDS as readonly string[]).includes(input.kind)) return fail("نوع الرسالة غير معروف.");
  const k = key(input.kind as GymMessageKind);
  if (input.body === null || !input.body.trim()) { await scope.delete(t.whatsappTemplates, eq(t.whatsappTemplates.key, k)); return ok(undefined); }
  const body = input.body.trim();
  if (body.length < 5 || body.length > 600) return fail("الرسالة من 5 لـ 600 حرف.");
  const [cur] = await scope.from(t.whatsappTemplates, eq(t.whatsappTemplates.key, k)).limit(1);
  if (cur) await scope.update(t.whatsappTemplates, { body }, eq(t.whatsappTemplates.id, cur.id));
  else await scope.insert(t.whatsappTemplates, { key: k, body });
  return ok(undefined);
}
export const renderGym = (body: string, vars: Partial<Record<(typeof GYM_VARS)[number], string>>) =>
  body.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k as keyof typeof vars] ?? "" : m)).replace(/ {2,}/g, " ").trim();

/** adapter لـ WhatsApp Business API (قريباً): يرسل مباشرة بدل ضغطة الاستقبال */
export interface WhatsappBusinessAdapter { readonly name: string; send(phone: string, text: string): Promise<void> }
export const noopWhatsappBusiness: WhatsappBusinessAdapter = { name: "قريباً", async send() { /* لما يتوفر الاتفاق */ } };


/** «رسائل اليوم»: اللي تستحق رسالة ولسه ما اتبعتتش (السجل يمنع التكرار) */
export async function todayMessages(scope: StoreScope, storeName: string, now = Date.now()): Promise<TodayMessage[]> {
  const [cfg, templates, members, ships, inst, log, last] = await Promise.all([
    gymConfigOf(scope), getGymTemplates(scope), scope.from(t.gymMembers, eq(t.gymMembers.status, "active")), scope.from(t.gymMemberships), scope.from(t.gymInstallments),
    scope.from(t.gymMessageLog, gte(t.gymMessageLog.sentAt, new Date(now - 120 * DAY))),
    scope.from(t.gymCheckins, eq(t.gymCheckins.result, "ok")).orderBy(desc(t.gymCheckins.at)).limit(8000),
  ]);
  const sent = new Set(log.map((l) => `${l.memberId}|${l.kind}|${l.refId}`));
  const out: TodayMessage[] = [];
  const add = (m: (typeof members)[number], kind: GymMessageKind, refId: string, vars: Parameters<typeof renderGym>[1]) => {
    if (sent.has(`${m.id}|${kind}|${refId}`)) return;
    const text = renderGym(templates[kind].body, { name: m.name, store: storeName, ...vars });
    const wa = toWhatsappNumber(m.phone);
    out.push({ memberId: m.id, name: m.name, phone: m.phone, kind, refId, text, link: wa ? waLink(wa, text) : null });
  };
  const monthDay = libyaDay(now).slice(5);
  for (const m of members) {
    const mine = ships.filter((s) => s.memberId === (m.parentMemberId ?? m.id) && (s.status === "active" || s.status === "frozen"));
    const cur = [...mine].sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
    if (cur && cur.status === "active") {
      const d = daysLeft(cur.endsAt.getTime(), now);
      if (d >= 0 && d <= cfg.expiryNoticeDays) add(m, "expiring", cur.id, { days: String(d), date: formatDate(cur.endsAt.getTime()), plan: cur.planName });
      if (d < 0 && d >= -7) add(m, "expired", cur.id, { date: formatDate(cur.endsAt.getTime()), plan: cur.planName });
    }
    const due = overdueInstallments(inst.filter((i) => i.memberId === m.id).map((i) => ({ id: i.id, dueAt: i.dueAt.getTime(), amount: i.amount, paidAt: i.paidAt?.getTime() ?? null })), now + 2 * DAY, 0)[0];
    if (due) add(m, "installment", due.id, { amount: formatMoney(due.amount), date: formatDate(due.dueAt) });
    const lastVisit = last.find((c) => c.memberId === m.id)?.at.getTime();
    if (cur && cur.status === "active" && cur.endsAt.getTime() >= now && lastVisit && now - lastVisit >= cfg.absentDays * DAY && now - lastVisit < 60 * DAY) add(m, "absent", libyaDay(lastVisit), { days: String(Math.floor((now - lastVisit) / DAY)) });
    if (m.birthDate && m.birthDate.slice(5) === monthDay) add(m, "birthday", libyaDay(now).slice(0, 4), {});
    if (now - m.createdAt.getTime() < 2 * DAY && cur) add(m, "welcome", m.id, { plan: cur.planName, date: formatDate(cur.endsAt.getTime()) });
  }
  return out;
}

export async function markMessageSent(scope: StoreScope, memberId: string, kind: GymMessageKind, refId: string, now = Date.now()): Promise<Result> {
  if (!(GYM_MESSAGE_KINDS as readonly string[]).includes(kind)) return fail("نوع الرسالة غير معروف.");
  if (!(await scope.count(t.gymMembers, eq(t.gymMembers.id, memberId)))) return fail("العضو غير موجود.");
  try { await scope.insert(t.gymMessageLog, { memberId, kind, refId, sentAt: new Date(now) }); } catch { /* اتسجلت قبل */ }
  return ok(undefined);
}

/** رسالة تأكيد حجز حصة (تتبعت من قائمة الحصة بضغطة) */
export const classConfirmMessage = (templates: Awaited<ReturnType<typeof getGymTemplates>>, v: { name: string; store: string; className: string; date: string; time: string }) =>
  renderGym(templates.class_confirm.body, { name: v.name, store: v.store, class: v.className, date: v.date, time: v.time });
export { libyaDayStart };

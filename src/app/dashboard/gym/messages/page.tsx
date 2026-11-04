import type { Metadata } from "next";
import { getGymTemplates, todayMessages } from "@/server/gym/messages";
import { requireLineContext } from "@/server/store-context";
import { MessagesView } from "./view";

export const metadata: Metadata = { title: "رسائل النادي" };

export default async function MessagesPage() {
  const ctx = await requireLineContext("gym", "customers");
  const [msgs, tpl] = await Promise.all([todayMessages(ctx.scope, ctx.store.name), getGymTemplates(ctx.scope)]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">رسائل اليوم</h1><p className="text-muted">كل رسالة تفتح واتساب برسالة جاهزة، وبعد الإرسال تتعلّم «تم» باش ما تتكررش.</p></div>
      <MessagesView writable={ctx.lines.gym.writable} messages={msgs} templates={tpl} />
    </div>
  );
}

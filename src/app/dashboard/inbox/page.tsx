import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { moduleGate } from "@/components/dashboard/module-gate";
import { listChannels, listConversations } from "@/server/inbox/service";
import { requireStoreContext } from "@/server/store-context";
import { InboxView } from "./inbox-view";

export const metadata: Metadata = { title: "صندوق الرسائل" };

export default async function InboxPage() {
  const ctx = await requireStoreContext("orders");
  const gate = moduleGate(ctx, "marketplaceInbox");
  if (gate) {
    return (
      <div className="space-y-5">
        {gate}
        <div className="mx-auto max-w-2xl space-y-2 rounded-xl border border-line bg-surface-2/50 p-5 text-sm leading-7">
          <p className="flex items-center gap-2 font-semibold"><MessagesSquare className="size-4" aria-hidden /> شن راح يكون فيه؟</p>
          <ul className="list-disc space-y-1 ps-5 text-muted"><li>رسايل إنستغرام وفيسبوك وواتساب ورسائل متجرك في مكان واحد.</li><li>محادثة لكل زبون، مربوطة بسجله وطلبياته.</li><li>تحوّل أي محادثة لطلبية بضغطة.</li></ul>
        </div>
      </div>
    );
  }
  const [channels, conversations] = await Promise.all([listChannels(ctx.scope), listConversations(ctx.scope)]);
  return (
    <div className="space-y-5">
      <div><h1 className="flex items-center gap-2 text-2xl">صندوق الرسائل <span className="rounded-full bg-gold/20 px-3 py-0.5 text-sm">تجريبي</span></h1><p className="text-muted">الربط الآلي مع القنوات لسه ما اشتغلش. تقدر تسجّل المحادثات يدوياً وتحوّلها لطلبيات.</p></div>
      <InboxView channels={channels} conversations={conversations} writable={ctx.access.writable} />
    </div>
  );
}

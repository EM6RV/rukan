import { Bell, Check, ShoppingBag } from "lucide-react";
import { MockStore } from "./mock-store";
import type { StoreTemplate } from "@/lib/constants";

type Demo = { name: string; category?: string; primary: string; accent: string; template: StoreTemplate };

/**
 * عرض حي بدون فيديو: متجر على التلفون، زبون يضغط «اطلب»، وتوصل طلبية للوحة قدامك.
 * CSS فقط (تسلسل 8 ثواني)، يتعطل مع «تقليل الحركة». كل الأرقام توضيحية.
 */
export function HeroDemo({ store }: { store: Demo }) {
  return (
    <div className="relative mx-auto w-full max-w-md" role="img" aria-label="مثال حي: زبون يطلب من المتجر وتوصل الطلبية للوحة التحكم">
      <div aria-hidden className="absolute inset-6 -z-10 rounded-3xl bg-gold/30 blur-2xl" />
      {/* التلفون */}
      <div aria-hidden className="relative z-10 w-56 rotate-1 rounded-[2rem] border-[6px] border-white/15 bg-black/20 p-2 shadow-2xl shadow-black/40 sm:w-60">
        <MockStore {...store} className="rounded-[1.4rem]" />
        <div className="demo-tap absolute inset-x-6 bottom-5 flex h-9 items-center justify-center gap-1.5 rounded-full bg-gold text-sm font-bold text-navy shadow-lg"><ShoppingBag className="size-4" /> اطلب الحين</div>
        <div className="demo-toast absolute inset-x-5 top-14 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-navy shadow-xl"><Check className="size-4 text-success-fg" /> وصل طلبك! بنكلمك لتأكيد التوصيل</div>
      </div>
      {/* لوحة التحكم */}
      <div aria-hidden className="absolute -bottom-10 end-0 z-20 w-60 -rotate-2 rounded-2xl bg-white p-3 text-navy shadow-2xl shadow-black/40 sm:w-64">
        <div className="mb-2 flex items-center justify-between text-xs font-bold"><span>لوحة التحكم</span><Bell className="demo-bell size-4 text-gold" /></div>
        <div className="mb-2 rounded-lg bg-navy/5 px-2 py-1.5 text-[11px]"><span className="text-navy/80">مبيعات اليوم</span> <b className="tabular-nums">1,240 د.ل</b></div>
        <ul className="space-y-1.5 text-[11px]">
          <li className="demo-order flex items-center justify-between rounded-lg border border-gold bg-gold/15 px-2 py-1.5 font-semibold"><span>طلبية جديدة #1042</span><span className="tabular-nums">85 د.ل</span></li>
          <li className="flex items-center justify-between rounded-lg bg-navy/5 px-2 py-1.5"><span>#1041 · مع المندوب</span><span className="tabular-nums">120 د.ل</span></li>
          <li className="flex items-center justify-between rounded-lg bg-navy/5 px-2 py-1.5"><span>#1040 · تم التوصيل</span><span className="tabular-nums">64 د.ل</span></li>
        </ul>
      </div>
    </div>
  );
}

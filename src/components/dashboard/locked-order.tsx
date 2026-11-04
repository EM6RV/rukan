import { Lock, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/** طلبية فوق حد الباقة الشهري: الزبون طلب عادي، لكن بياناتها مخفية على البياع لين يرقّي */
export function LockedOrder({ number, limit }: { number: number; limit: number }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-2"><Lock className="size-6" aria-hidden /></div>
      <h1 className="text-xl">طلبية <span dir="ltr">#{number}</span> مقفولة</h1>
      <p className="max-w-sm leading-7 text-muted">وصلتك طلبية جديدة، لكن باقتك فيها {limit} طلبية في الشهر ووصلت الحد. رقّي باقتك باش تشوفها وتتعامل معاها، وكل الطلبيات المقفولة تتفتح فوراً.</p>
      <ButtonLink href="/dashboard/billing"><Sparkles className="size-4" aria-hidden /> رقّي باقتك</ButtonLink>
    </div>
  );
}

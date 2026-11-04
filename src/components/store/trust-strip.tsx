import { Banknote, MessageCircle, RotateCcw, Truck } from "lucide-react";

/** شريط ثقة تحت الهيرو: يطمّن الزبون (دفع عند الاستلام، توصيل، إرجاع، واتساب). كل القوالب تتلون بلون المتجر. */
export function TrustStrip({ freeOver, whatsapp }: { freeOver?: number | null; whatsapp: boolean }) {
  const items = [
    { icon: Banknote, title: "الدفع عند الاستلام", text: "ما تدفع إلا لما يوصلك" },
    { icon: Truck, title: "توصيل لكل ليبيا", text: freeOver ? `مجاني فوق ${freeOver} د.ل` : "لين باب البيت" },
    { icon: RotateCcw, title: "استبدال وإرجاع", text: "حسب سياسة المتجر" },
    ...(whatsapp ? [{ icon: MessageCircle, title: "كلمنا على واتساب", text: "نرد عليك بسرعة" }] : []),
  ];
  return (
    <ul className="-mt-6 flex flex-wrap justify-center gap-3 md:-mt-10" aria-label="مزايا الشراء">
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex w-[calc(50%-0.375rem)] items-center gap-3 rounded-2xl border border-(--sp-line) bg-white p-3 shadow-soft lg:w-[calc(25%-0.75rem)]">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--sa-soft) text-(--sp)"><Icon className="size-5" aria-hidden /></span>
          <span className="min-w-0"><span className="block text-sm font-bold leading-tight">{title}</span><span className="block text-xs text-(--sp-muted)">{text}</span></span>
        </li>
      ))}
    </ul>
  );
}

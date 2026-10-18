"use client";

import { useState } from "react";
import { Clapperboard, Gift, MessageCircle, Palette, PenTool, Sparkles, type LucideIcon } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/cn";
import { DESIGN_SERVICE_LABELS, FREE_DESIGN_SERVICES, type DesignService } from "@/lib/constants";
import { requestDesignAction } from "./actions";

const SERVICES: { id: DesignService; icon: LucideIcon; text: string }[] = [
  { id: "reel", icon: Clapperboard, text: "ريل قصير لإنستغرام وتيك توك بمنتجاتك وهويتك." },
  { id: "logo", icon: PenTool, text: "لوجو لمتجرك أو علامتك." },
  { id: "identity", icon: Palette, text: "هوية كاملة: لوجو وألوان وخطوط وشكل موحد." },
  { id: "other", icon: Sparkles, text: "بوستر، غلاف، تصميم عروض… قول لنا شن تبي." },
];

export function DesignServices({ writable, supportReady, free }: { writable: boolean; supportReady: boolean; free: { total: number; used: number; remaining: number } }) {
  const [service, setService] = useState<DesignService>("reel");
  const [note, setNote] = useState("");
  const [useFree, setUseFree] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const { act, pending, error } = useAct();
  const canFree = free.remaining > 0 && FREE_DESIGN_SERVICES.includes(service);

  function submit() {
    act(async () => {
      const r = await requestDesignAction({ service, note, useFree: canFree && useFree });
      if (r.ok && "data" in r) { setLink(r.data.link); window.open(r.data.link, "_blank", "noopener,noreferrer"); }
      return r;
    }, "تم تسجيل طلبك. كمّل على واتساب");
  }

  if (!supportReady) return <Card><CardBody className="text-sm text-muted">رقم واتساب خدمات التصميم لسا ما اتحدد. كلّم دعم رُكن لتطلب تصميم.</CardBody></Card>;

  return (
    <div className="space-y-5">
      {free.total > 0 && (
        <Card className="border-gold bg-gold/10"><CardBody className="flex items-start gap-3 text-sm">
          <Gift className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{free.remaining > 0 ? <>باقتك فيها <b>تصميم مجاني</b> (ريل أو لوجو) في كل فترة اشتراك. باقيلك {free.remaining} من {free.total}.</> : <>استعملت التصميم المجاني في فترة اشتراكك الحالية. يتجدد مع تجديد الاشتراك.</>}</p>
        </CardBody></Card>
      )}

      <Card><CardBody className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">شن تبي نصمم لك؟</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {SERVICES.map(({ id, icon: Icon, text }) => (
              <label key={id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-teal has-checked:border-gold has-checked:bg-gold/10", service === id ? "border-gold" : "border-line hover:border-gold/60")}>
                <input type="radio" name="service" value={id} checked={service === id} onChange={() => { setService(id); setUseFree(false); }} className="sr-only" />
                <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span className="space-y-0.5"><span className="block font-semibold">{DESIGN_SERVICE_LABELS[id]}</span><span className="block text-sm text-muted">{text}</span><span className="block text-xs text-muted">السعر حسب الطلب</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <Textarea label="وصف قصير (اختياري)" rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: ريل عن تشكيلة العطور الجديدة، 20 ثانية، بألوان المتجر." hint="لوجو شركتك والمراجع ترسلها في واتساب بعد ما تضغط الزر." />

        {canFree && <Toggle label="استعمل التصميم المجاني ضمن باقتي" checked={useFree} onChange={setUseFree} />}

        {error && <p role="alert" className={errorClass}>{error}</p>}
        {!writable && <p className="text-sm text-danger-fg">انتهى اشتراكك. جدّد الاشتراك لتطلب تصميم.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button loading={pending} disabled={!writable} onClick={submit}><MessageCircle className="size-4" aria-hidden /> اطلب على واتساب</Button>
          {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-link underline underline-offset-4">ما انفتح واتساب؟ اضغط هنا</a>}
        </div>
      </CardBody></Card>
    </div>
  );
}

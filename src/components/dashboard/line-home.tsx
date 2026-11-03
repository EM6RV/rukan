import { CheckCircle2, Clock } from "lucide-react";
import { LineStatus } from "@/components/dashboard/line-status";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatMoney } from "@/lib/money";
import { GYM_SECTION_LABELS, STATION_KIND_LABELS } from "@/lib/line-setup";
import { LINE_INFO, type ProductLine } from "@/lib/product-lines";
import { lineSetups } from "@/server/lines";
import { renewLinkFor } from "@/server/lines-view";
import { requireLineContext } from "@/server/store-context";

/** ما تجهّز من المعالج القصير (يتحول لكاشيرات/أجهزة/اشتراكات حقيقية لما المنظومة تنبني) */
const COMING: Record<Exclude<ProductLine, "store">, string[]> = {
  market: ["الكاشير بالباركود والميزان، ويشتغل بدون نت", "دفتر الدين والمحفظة", "الجملة والكرتونة والحبة", "الصلاحية والدفعات والجرد"],
  lounge: ["شاشة الصالة: عداد لكل جهاز بالساعة أو بالماتش", "البار على نفس الفاتورة", "الحجوزات وشاشة الحائط", "البطولات"],
  gym: ["الاستقبال والدخول بالـ QR", "الاشتراكات والتجميد والأقساط", "الحصص والمدربين", "صفحة العضو ورسائل واتساب"],
};

export async function LineHome({ line }: { line: Exclude<ProductLine, "store"> }) {
  const ctx = await requireLineContext(line, "dashboard");
  const db = getDb();
  const [setups, renew] = await Promise.all([lineSetups(db, ctx.store.id), renewLinkFor(db, ctx, line)]);
  const setup = setups[line];
  const info = LINE_INFO[line];
  const m = setup?.market, l = setup?.lounge, g = setup?.gym;

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">{info.brand}</h1><p className="text-muted">{info.description}</p></div>
      <Card><CardBody><LineStatus access={ctx.lines[line]} renew={renew} /></CardBody></Card>

      {(m || l || g) && (
        <Card>
          <CardHeader title="إعدادك المبدئي" description="من معالج التسجيل. نجهزوا بيه كل شي لما تفتح المنظومة." />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {m && <>
                <li>المحل: <b>{m.shopName}</b></li>
                <li>الكاشيرات: <b>{m.registers}</b>{m.wholesale ? " · يبيع جملة" : ""}{m.scale ? " · عنده ميزان" : ""}</li>
              </>}
              {l && <>
                <li>الأجهزة: {l.stations?.map((s) => `${STATION_KIND_LABELS[s.type as keyof typeof STATION_KIND_LABELS] ?? s.type} × ${s.count}`).join("، ")}</li>
                {l.hourlyPrice != null && <li>سعر الساعة المبدئي: <b>{formatMoney(l.hourlyPrice)}</b></li>}
              </>}
              {g && <>
                <li>الأقسام: {g.sections?.map((s) => GYM_SECTION_LABELS[s]).join("، ")}</li>
                <li>الاشتراكات: {g.membershipTypes?.map((x) => `${x.name} (${formatMoney(x.price)})`).join("، ")}</li>
                {!!g.trainers?.length && <li>المدربين: {g.trainers.join("، ")}</li>}
              </>}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title={`${info.opsLabel} قيد التجهيز`} description="المنظومة تنفتح على مراحل. هذا اللي جاي:" />
        <CardBody>
          <ul className="space-y-2.5">
            {COMING[line].map((x) => <li key={x} className="flex items-center gap-2 text-sm"><Clock className="size-4 shrink-0 text-muted" aria-hidden /> {x}</li>)}
            <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 shrink-0 text-success-fg" aria-hidden /> المنتجات والموظفين والخزنة مشتركين مع باقي منظوماتك من الحين.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

"use client";

import { STORE_TEMPLATES, STORE_TEMPLATE_LABELS } from "@/lib/constants";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { ImageUploader } from "@/components/dashboard/image-uploader";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm";
import { Input, Select, Textarea } from "@/components/ui/field";
import { FEATURE_ICONS, FEATURE_ICON_LABELS, type SiteContent } from "@/lib/site-content";
import { resetSiteContentAction, saveSiteContentAction } from "../actions";

type Img = { id: string; url: string } | null;
const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 30);

function ListButtons({ i, n, move, remove }: { i: number; n: number; move: (from: number, to: number) => void; remove: () => void }) {
  const b = "flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 disabled:opacity-40";
  return (
    <div className="flex shrink-0">
      <button type="button" aria-label="لفوق" className={b} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp className="size-4" /></button>
      <button type="button" aria-label="لتحت" className={b} disabled={i === n - 1} onClick={() => move(i, i + 1)}><ArrowDown className="size-4" /></button>
      <button type="button" aria-label="حذف" className={b} onClick={remove}><Trash2 className="size-4 text-danger-fg" /></button>
    </div>
  );
}

function swap<T>(list: T[], from: number, to: number) { const n = list.slice(); const [x] = n.splice(from, 1); n.splice(to, 0, x!); return n; }

export function SiteEditor({ initial, heroImage }: { initial: SiteContent; heroImage: Img }) {
  const [c, setC] = useState<SiteContent>(initial);
  const [img, setImg] = useState<Img>(heroImage);
  const [confirmReset, setConfirmReset] = useState(false);
  const save = useAct();
  const reset = useAct();

  const set = <K extends keyof SiteContent>(k: K, patch: Partial<SiteContent[K]>) => setC((x) => ({ ...x, [k]: { ...x[k], ...patch } }));
  const setItem = <K extends "features" | "showcase" | "design" | "steps" | "faq">(k: K, i: number, patch: Partial<SiteContent[K]["items"][number]>) =>
    setC((x) => ({ ...x, [k]: { ...x[k], items: x[k].items.map((it, j) => (j === i ? { ...it, ...patch } : it)) } }) as SiteContent);
  const move = <K extends "features" | "showcase" | "design" | "steps" | "faq">(k: K) => (from: number, to: number) => setC((x) => ({ ...x, [k]: { ...x[k], items: swap(x[k].items as never[], from, to) } }) as SiteContent);
  const remove = <K extends "features" | "showcase" | "design" | "steps" | "faq">(k: K, i: number) => setC((x) => ({ ...x, [k]: { ...x[k], items: x[k].items.filter((_, j) => j !== i) } }) as SiteContent);
  const add = <K extends "features" | "showcase" | "design" | "steps" | "faq">(k: K, item: SiteContent[K]["items"][number]) => setC((x) => ({ ...x, [k]: { ...x[k], items: [...x[k].items, item] } }) as SiteContent);

  const onSave = () => save.act(() => saveSiteContentAction({ ...c, hero: { ...c.hero, imageMediaId: img?.id ?? null } }), "تم حفظ محتوى الموقع");

  return (
    <div className="space-y-5">
      <Card><CardHeader title="الغلاف (الهيرو)" /><CardBody className="space-y-4">
        <Input label="الشارة الصغيرة" value={c.hero.badge} maxLength={60} onChange={(e) => set("hero", { badge: e.target.value })} />
        <Input label="العنوان الرئيسي" value={c.hero.title} maxLength={90} onChange={(e) => set("hero", { title: e.target.value })} />
        <Textarea label="الوصف" rows={3} maxLength={300} value={c.hero.subtitle} onChange={(e) => set("hero", { subtitle: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2"><Input label="الزر الرئيسي" value={c.hero.primaryCta} maxLength={30} onChange={(e) => set("hero", { primaryCta: e.target.value })} /><Input label="الزر الثاني" value={c.hero.secondaryCta} maxLength={30} onChange={(e) => set("hero", { secondaryCta: e.target.value })} hint="فاضي = بدون زر ثاني" /></div>
        <ImageUploader label="صورة الهيرو (اختياري)" hint="لو ما حطيتش صورة نعرض مثال متجر حي." kind="site" shape="wide" value={img} onChange={setImg} />
      </CardBody></Card>

      <Card><CardHeader title="المميزات" /><CardBody className="space-y-4">
        <Input label="العنوان" value={c.features.title} maxLength={80} onChange={(e) => set("features", { title: e.target.value })} />
        <Input label="الوصف" value={c.features.subtitle} maxLength={200} onChange={(e) => set("features", { subtitle: e.target.value })} />
        {c.features.items.map((it, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-line p-3">
            <div className="flex items-end gap-2"><div className="w-36"><Select label="الأيقونة" value={it.icon} onChange={(e) => setItem("features", i, { icon: e.target.value as never })}>{FEATURE_ICONS.map((k) => <option key={k} value={k}>{FEATURE_ICON_LABELS[k]}</option>)}</Select></div><div className="min-w-0 flex-1"><Input label="العنوان" value={it.title} maxLength={50} onChange={(e) => setItem("features", i, { title: e.target.value })} /></div><ListButtons i={i} n={c.features.items.length} move={move("features")} remove={() => remove("features", i)} /></div>
            <Textarea label="النص" rows={2} maxLength={220} value={it.text} onChange={(e) => setItem("features", i, { text: e.target.value })} />
          </div>
        ))}
        {c.features.items.length < 9 && <Button variant="outline" size="sm" onClick={() => add("features", { icon: "store", title: "ميزة جديدة", text: "وصف الميزة" })}><Plus className="size-4" aria-hidden /> ميزة</Button>}
      </CardBody></Card>

      <Card><CardHeader title="أمثلة المتاجر" description="تصاميم وهمية بألوانها. الرابط اختياري (لو عندك متجر تجريبي حقيقي)." /><CardBody className="space-y-4">
        <Input label="العنوان" value={c.showcase.title} maxLength={80} onChange={(e) => set("showcase", { title: e.target.value })} />
        <Input label="الوصف" value={c.showcase.subtitle} maxLength={200} onChange={(e) => set("showcase", { subtitle: e.target.value })} />
        {c.showcase.items.map((it, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-line p-3">
            <div className="flex items-end gap-2"><div className="min-w-0 flex-1"><Input label="اسم المتجر" value={it.name} maxLength={40} onChange={(e) => setItem("showcase", i, { name: e.target.value })} /></div><ListButtons i={i} n={c.showcase.items.length} move={move("showcase")} remove={() => remove("showcase", i)} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><Input label="النشاط" value={it.category} maxLength={40} onChange={(e) => setItem("showcase", i, { category: e.target.value })} /><Select label="القالب" value={it.template} onChange={(e) => setItem("showcase", i, { template: e.target.value as never })}>{STORE_TEMPLATES.map((v) => <option key={v} value={v}>{STORE_TEMPLATE_LABELS[v]}</option>)}</Select></div>
            <div className="grid grid-cols-2 gap-3"><label className="flex items-center gap-2 text-sm font-medium">الأساسي <input type="color" value={it.primary} onChange={(e) => setItem("showcase", i, { primary: e.target.value })} className="h-9 w-14 rounded border border-line" /></label><label className="flex items-center gap-2 text-sm font-medium">التمييز <input type="color" value={it.accent} onChange={(e) => setItem("showcase", i, { accent: e.target.value })} className="h-9 w-14 rounded border border-line" /></label></div>
            <Input label="رابط (اختياري)" dir="ltr" className="text-right" value={it.href} maxLength={300} onChange={(e) => setItem("showcase", i, { href: e.target.value })} hint="https://… أو /s/اسم-المتجر" />
          </div>
        ))}
        {c.showcase.items.length < 6 && <Button variant="outline" size="sm" onClick={() => add("showcase", { name: "متجر جديد", category: "نشاط", primary: "#0D263E", accent: "#C19E58", template: "naqa", href: "" })}><Plus className="size-4" aria-hidden /> مثال</Button>}
      </CardBody></Card>

      <Card><CardHeader title="شريط الثقة" description="شارات صغيرة تحت الغلاف. الشركاء: شركات ليبية مربوطة فعلاً فقط (فاضية = ما تظهر)." /><CardBody className="space-y-4">
        <Textarea label="الشارات (كل واحدة في سطر)" rows={4} maxLength={300} value={c.trust.items.join("\n")} onChange={(e) => set("trust", { items: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6) })} />
        <Input label="عنوان الشركاء" value={c.trust.partnersTitle} maxLength={60} onChange={(e) => set("trust", { partnersTitle: e.target.value })} />
        <Textarea label="الشركاء (كل شركة في سطر)" rows={3} maxLength={400} value={c.trust.partners.map((p) => p.name).join("\n")} onChange={(e) => set("trust", { partners: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 12).map((name) => ({ name })) })} hint="مثال: فانكس، درب السبيل، النورس — لا تكتب إلا شركة مربوطة فعلاً." />
      </CardBody></Card>

      <Card><CardHeader title="رُكن مش بس متجر (المنظومات)" description="ثلاث بطاقات في الرئيسية وصفحة لكل منظومة /systems/الرمز." /><CardBody className="space-y-4">
        <Input label="العنوان" value={c.systems.title} maxLength={60} onChange={(e) => set("systems", { title: e.target.value })} />
        <Input label="الوصف" value={c.systems.subtitle} maxLength={200} onChange={(e) => set("systems", { subtitle: e.target.value })} />
        {c.systems.items.map((it, i) => {
          const upd = (patch: Partial<typeof it>) => setC((x) => ({ ...x, systems: { ...x.systems, items: x.systems.items.map((n, j) => (j === i ? { ...n, ...patch } : n)) } }));
          return (
            <div key={it.slug} className="space-y-3 rounded-lg border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-3"><Input label="الاسم" value={it.name} maxLength={30} onChange={(e) => upd({ name: e.target.value })} /><Input label="الشعار" value={it.tagline} maxLength={80} onChange={(e) => upd({ tagline: e.target.value })} /><Input label="نص الزر" value={it.cta} maxLength={30} onChange={(e) => upd({ cta: e.target.value })} /></div>
              <Textarea label="الوصف" rows={3} maxLength={300} value={it.text} onChange={(e) => upd({ text: e.target.value })} />
              <Textarea label="المميزات (كل ميزة في سطر)" rows={5} maxLength={640} value={it.points.join("\n")} onChange={(e) => upd({ points: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8) })} />
            </div>
          );
        })}
      </CardBody></Card>

      <Card><CardHeader title="شن نشاطك؟ (صفحات الأنشطة)" description="كل نشاط له صفحة خاصة /for/الرمز بمثال وقالب مقترح." /><CardBody className="space-y-4">
        <Input label="العنوان" value={c.niches.title} maxLength={60} onChange={(e) => set("niches", { title: e.target.value })} />
        <Input label="الوصف" value={c.niches.subtitle} maxLength={200} onChange={(e) => set("niches", { subtitle: e.target.value })} />
        {c.niches.items.map((it, i) => {
          const upd = (patch: Partial<typeof it>) => setC((x) => ({ ...x, niches: { ...x.niches, items: x.niches.items.map((n, j) => (j === i ? { ...n, ...patch } : n)) } }));
          return (
            <div key={i} className="space-y-3 rounded-lg border border-line p-3">
              <div className="flex items-end gap-2"><div className="min-w-0 flex-1"><Input label="اسم النشاط" value={it.title} maxLength={40} onChange={(e) => upd({ title: e.target.value })} /></div>
                <div className="flex shrink-0">
                  <button type="button" aria-label="لفوق" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 disabled:opacity-40" disabled={i === 0} onClick={() => setC((x) => ({ ...x, niches: { ...x.niches, items: swap(x.niches.items, i, i - 1) } }))}><ArrowUp className="size-4" /></button>
                  <button type="button" aria-label="لتحت" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 disabled:opacity-40" disabled={i === c.niches.items.length - 1} onClick={() => setC((x) => ({ ...x, niches: { ...x.niches, items: swap(x.niches.items, i, i + 1) } }))}><ArrowDown className="size-4" /></button>
                  <button type="button" aria-label="حذف" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2" onClick={() => setC((x) => ({ ...x, niches: { ...x.niches, items: x.niches.items.filter((_, j) => j !== i) } }))}><Trash2 className="size-4 text-danger-fg" /></button>
                </div></div>
              <div className="grid gap-3 sm:grid-cols-2"><Input label="الرمز في الرابط (إنجليزي)" dir="ltr" className="text-right" value={it.slug} maxLength={30} onChange={(e) => upd({ slug: slugify(e.target.value) })} hint={`/for/${it.slug}`} /><Select label="القالب المقترح" value={it.template} onChange={(e) => upd({ template: e.target.value as never })}>{STORE_TEMPLATES.map((v) => <option key={v} value={v}>{STORE_TEMPLATE_LABELS[v]}</option>)}</Select></div>
              <Input label="عنوان الصفحة" value={it.headline} maxLength={90} onChange={(e) => upd({ headline: e.target.value })} />
              <Textarea label="الوصف" rows={2} maxLength={260} value={it.text} onChange={(e) => upd({ text: e.target.value })} />
              <Textarea label="المميزات (كل ميزة في سطر)" rows={3} maxLength={450} value={it.benefits.join("\n")} onChange={(e) => upd({ benefits: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5) })} />
              <div className="grid items-end gap-3 sm:grid-cols-3"><Input label="متجر المثال" value={it.example} maxLength={40} onChange={(e) => upd({ example: e.target.value })} /><label className="flex items-center gap-2 text-sm font-medium">الأساسي <input type="color" value={it.primary} onChange={(e) => upd({ primary: e.target.value })} className="h-9 w-14 rounded border border-line" /></label><label className="flex items-center gap-2 text-sm font-medium">التمييز <input type="color" value={it.accent} onChange={(e) => upd({ accent: e.target.value })} className="h-9 w-14 rounded border border-line" /></label></div>
            </div>
          );
        })}
        {c.niches.items.length < 9 && <Button variant="outline" size="sm" onClick={() => setC((x) => ({ ...x, niches: { ...x.niches, items: [...x.niches.items, { slug: `activity-${x.niches.items.length + 1}`, title: "نشاط جديد", headline: "عنوان الصفحة", text: "وصف النشاط", benefits: ["ميزة"], template: "naqa", primary: "#0D263E", accent: "#C19E58", example: "متجر المثال" }] } }))}><Plus className="size-4" aria-hidden /> نشاط</Button>}
      </CardBody></Card>

      <Card><CardHeader title="معرض القوالب" description="القوالب الستة بمعاينة حية. اللون والوصف لكل واحد." /><CardBody className="space-y-4">
        <Input label="العنوان" value={c.templates.title} maxLength={80} onChange={(e) => set("templates", { title: e.target.value })} />
        <Input label="الوصف" value={c.templates.subtitle} maxLength={200} onChange={(e) => set("templates", { subtitle: e.target.value })} />
        <Input label="نص زر القالب" value={c.templates.button} maxLength={30} onChange={(e) => set("templates", { button: e.target.value })} />
        {c.templates.items.map((it, i) => {
          const upd = (patch: Partial<typeof it>) => setC((x) => ({ ...x, templates: { ...x.templates, items: x.templates.items.map((n, j) => (j === i ? { ...n, ...patch } : n)) } }));
          return (
            <div key={i} className="grid items-end gap-3 rounded-lg border border-line p-3 sm:grid-cols-[8rem_1fr_auto_auto]">
              <Select label="القالب" value={it.template} onChange={(e) => upd({ template: e.target.value as never })}>{STORE_TEMPLATES.map((v) => <option key={v} value={v}>{STORE_TEMPLATE_LABELS[v]}</option>)}</Select>
              <Input label="الوصف" value={it.blurb} maxLength={120} onChange={(e) => upd({ blurb: e.target.value })} />
              <label className="flex items-center gap-2 text-sm font-medium">الأساسي <input type="color" value={it.primary} onChange={(e) => upd({ primary: e.target.value })} className="h-9 w-12 rounded border border-line" /></label>
              <label className="flex items-center gap-2 text-sm font-medium">التمييز <input type="color" value={it.accent} onChange={(e) => upd({ accent: e.target.value })} className="h-9 w-12 rounded border border-line" /></label>
            </div>
          );
        })}
      </CardBody></Card>

      <Card><CardHeader title="المميزات كقصص" /><CardBody className="space-y-4">
        <Input label="العنوان" value={c.stories.title} maxLength={80} onChange={(e) => set("stories", { title: e.target.value })} />
        <Input label="الوصف" value={c.stories.subtitle} maxLength={200} onChange={(e) => set("stories", { subtitle: e.target.value })} />
        {c.stories.items.map((it, i) => {
          const upd = (patch: Partial<typeof it>) => setC((x) => ({ ...x, stories: { ...x.stories, items: x.stories.items.map((n, j) => (j === i ? { ...n, ...patch } : n)) } }));
          return (
            <div key={i} className="space-y-3 rounded-lg border border-line p-3">
              <div className="flex items-end gap-2"><div className="w-36"><Select label="الأيقونة" value={it.icon} onChange={(e) => upd({ icon: e.target.value as never })}>{FEATURE_ICONS.map((k) => <option key={k} value={k}>{FEATURE_ICON_LABELS[k]}</option>)}</Select></div><div className="min-w-0 flex-1"><Input label="العنوان" value={it.title} maxLength={50} onChange={(e) => upd({ title: e.target.value })} /></div>
                <button type="button" aria-label="حذف" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2" onClick={() => setC((x) => ({ ...x, stories: { ...x.stories, items: x.stories.items.filter((_, j) => j !== i) } }))}><Trash2 className="size-4 text-danger-fg" /></button></div>
              <Textarea label="الحكاية" rows={2} maxLength={260} value={it.text} onChange={(e) => upd({ text: e.target.value })} />
              <Textarea label="نقاط (كل نقطة في سطر)" rows={3} maxLength={300} value={it.points.join("\n")} onChange={(e) => upd({ points: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 4) })} />
            </div>
          );
        })}
        {c.stories.items.length < 6 && <Button variant="outline" size="sm" onClick={() => setC((x) => ({ ...x, stories: { ...x.stories, items: [...x.stories.items, { icon: "store", title: "قصة جديدة", text: "الحكاية", points: [] }] } }))}><Plus className="size-4" aria-hidden /> قصة</Button>}
      </CardBody></Card>

      <Card><CardHeader title="خدمات التصميم" description="قسم في الصفحة الرئيسية يعلن عن الريلز واللوجو والهوية. الطلب نفسه يجي من لوحة البياع." /><CardBody className="space-y-4">
        <Input label="العنوان" value={c.design.title} maxLength={80} onChange={(e) => set("design", { title: e.target.value })} />
        <Input label="الوصف" value={c.design.subtitle} maxLength={250} onChange={(e) => set("design", { subtitle: e.target.value })} />
        <Input label="نص الزر" value={c.design.button} maxLength={30} onChange={(e) => set("design", { button: e.target.value })} />
        {c.design.items.map((it, i) => (
          <div key={i} className="flex items-end gap-2 rounded-lg border border-line p-3"><div className="min-w-0 flex-1 space-y-3"><Input label={`الخدمة ${i + 1}`} value={it.title} maxLength={50} onChange={(e) => setItem("design", i, { title: e.target.value })} /><Input label="الوصف" value={it.text} maxLength={220} onChange={(e) => setItem("design", i, { text: e.target.value })} /></div><ListButtons i={i} n={c.design.items.length} move={move("design")} remove={() => remove("design", i)} /></div>
        ))}
        {c.design.items.length < 6 && <Button variant="outline" size="sm" onClick={() => add("design", { title: "خدمة جديدة", text: "" })}><Plus className="size-4" aria-hidden /> خدمة</Button>}
      </CardBody></Card>

      <Card><CardHeader title="الخطوات" /><CardBody className="space-y-4">
        <Input label="العنوان" value={c.steps.title} maxLength={80} onChange={(e) => set("steps", { title: e.target.value })} />
        {c.steps.items.map((it, i) => (
          <div key={i} className="flex items-end gap-2 rounded-lg border border-line p-3"><div className="min-w-0 flex-1 space-y-3"><Input label={`الخطوة ${i + 1}`} value={it.title} maxLength={40} onChange={(e) => setItem("steps", i, { title: e.target.value })} /><Input label="الوصف" value={it.text} maxLength={180} onChange={(e) => setItem("steps", i, { text: e.target.value })} /></div><ListButtons i={i} n={c.steps.items.length} move={move("steps")} remove={() => remove("steps", i)} /></div>
        ))}
        {c.steps.items.length < 5 && <Button variant="outline" size="sm" onClick={() => add("steps", { title: "خطوة جديدة", text: "" })}><Plus className="size-4" aria-hidden /> خطوة</Button>}
      </CardBody></Card>

      <Card><CardHeader title="الأسعار" description="الباقات وأسعارها من صفحة «الباقات». هنا النصوص حواليها بس." /><CardBody className="space-y-4">
        <Input label="العنوان" value={c.pricing.title} maxLength={80} onChange={(e) => set("pricing", { title: e.target.value })} />
        <Input label="الوصف" value={c.pricing.subtitle} maxLength={200} onChange={(e) => set("pricing", { subtitle: e.target.value })} />
        <Textarea label="ملاحظة تحت الأسعار" rows={2} maxLength={250} value={c.pricing.note} onChange={(e) => set("pricing", { note: e.target.value })} />
      </CardBody></Card>

      <Card><CardHeader title="الأسئلة الشائعة" /><CardBody className="space-y-4">
        <Input label="العنوان" value={c.faq.title} maxLength={80} onChange={(e) => set("faq", { title: e.target.value })} />
        {c.faq.items.map((it, i) => (
          <div key={i} className="flex items-end gap-2 rounded-lg border border-line p-3"><div className="min-w-0 flex-1 space-y-3"><Input label="السؤال" value={it.q} maxLength={120} onChange={(e) => setItem("faq", i, { q: e.target.value })} /><Textarea label="الجواب" rows={2} maxLength={500} value={it.a} onChange={(e) => setItem("faq", i, { a: e.target.value })} /></div><ListButtons i={i} n={c.faq.items.length} move={move("faq")} remove={() => remove("faq", i)} /></div>
        ))}
        {c.faq.items.length < 12 && <Button variant="outline" size="sm" onClick={() => add("faq", { q: "سؤال جديد؟", a: "الجواب" })}><Plus className="size-4" aria-hidden /> سؤال</Button>}
      </CardBody></Card>

      <Card><CardHeader title="الدعوة الأخيرة، الفوتر، SEO" /><CardBody className="space-y-4">
        <Input label="عنوان الدعوة" value={c.cta.title} maxLength={80} onChange={(e) => set("cta", { title: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2"><Input label="وصف الدعوة" value={c.cta.subtitle} maxLength={200} onChange={(e) => set("cta", { subtitle: e.target.value })} /><Input label="نص الزر" value={c.cta.button} maxLength={30} onChange={(e) => set("cta", { button: e.target.value })} /></div>
        <Input label="نص الفوتر" value={c.footer.text} maxLength={160} onChange={(e) => set("footer", { text: e.target.value })} />
        <Input label="عنوان الصفحة في جوجل" value={c.seo.title} maxLength={70} onChange={(e) => set("seo", { title: e.target.value })} hint={`${c.seo.title.length}/70`} />
        <Textarea label="وصف الصفحة في جوجل" rows={2} maxLength={160} value={c.seo.description} onChange={(e) => set("seo", { description: e.target.value })} hint={`${c.seo.description.length}/160`} />
      </CardBody></Card>

      {save.error && <p role="alert" className={errorClass}>{save.error}</p>}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 p-3 shadow-lift backdrop-blur">
        <Button loading={save.pending} onClick={onSave}>حفظ محتوى الموقع</Button>
        <Button variant="ghost" onClick={() => { reset.setError(null); setConfirmReset(true); }}>إعادة للنص الأصلي</Button>
      </div>
      <ConfirmModal open={confirmReset} onClose={() => setConfirmReset(false)} danger loading={reset.pending} title="إعادة المحتوى للأصل" message={reset.error ?? "رجّع الأصل؟ يتحذف كل تعديلك على نصوص وصور الموقع، ويرجع النص الافتراضي."} confirmLabel="إعادة" onConfirm={() => reset.act(() => resetSiteContentAction(), "رجع المحتوى للأصل", () => setConfirmReset(false))} />
    </div>
  );
}

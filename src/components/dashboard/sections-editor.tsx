"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { ImageUploader } from "@/components/dashboard/image-uploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SortableList } from "@/components/ui/sortable-list";
import { useToast } from "@/components/ui/toast";
import { MAX_SECTIONS, SECTION_HINTS, SECTION_LABELS, SECTION_TYPES, SINGLE_SECTION_TYPES, type SectionType } from "@/lib/home-sections";
import { notifyStoreSaved } from "@/lib/preview-signal";
import { saveSectionsAction } from "@/app/dashboard/content/actions";

type Img = { id: string; url: string } | null;
export type EditorSection = { key: string; id: string | null; type: SectionType; isVisible: boolean; config: { title: string; subtitle: string; ctaLabel: string; linkUrl: string; body: string }; image: Img };
export type InitialSection = { id: string; type: SectionType; isVisible: boolean; config: Record<string, unknown>; image: Img };

const s = (v: unknown) => (typeof v === "string" ? v : "");
let counter = 0;
const newKey = () => `n${++counter}`;
const fromInitial = (x: InitialSection): EditorSection => ({
  key: x.id, id: x.id, type: x.type, isVisible: x.isVisible, image: x.image,
  config: { title: s(x.config.title), subtitle: s(x.config.subtitle), ctaLabel: s(x.config.ctaLabel), linkUrl: s(x.config.linkUrl), body: s(x.config.body) },
});

const sectionSummary = (x: EditorSection) =>
  x.type === "hero" ? x.config.title || "العنوان = اسم المتجر" : x.type === "text" ? x.config.body.slice(0, 50) : x.config.title || (x.type === "banner" ? "بدون عنوان" : "العنوان الافتراضي");

function IconBtn({ label, ...p }: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" aria-label={label} title={label} className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40" {...p} />;
}

function SectionForm({ draft, onCancel, onSave }: { draft: EditorSection; onCancel: () => void; onSave: (x: EditorSection) => void }) {
  const [v, setV] = useState(draft);
  const c = v.config;
  const set = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, config: { ...c, [k]: e.target.value } });
  const needsImage = v.type === "banner" && !v.image;
  return (
    <Modal open onClose={onCancel} title={`${draft.id ? "تعديل" : "إضافة"}: ${SECTION_LABELS[v.type]}`}
      footer={<><Button variant="ghost" onClick={onCancel}>رجوع</Button><Button disabled={needsImage || (v.type === "text" && !c.body.trim())} onClick={() => onSave(v)}>تم</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{SECTION_HINTS[v.type]}</p>
        {(v.type === "hero" || v.type === "banner") && <ImageUploader label={v.type === "hero" ? "صورة الغلاف (اختياري)" : "صورة البانر"} kind="banner" shape="wide" value={v.image} onChange={(image) => setV({ ...v, image })} hint={v.type === "banner" ? "صورة عرضية، الأفضل 1600×700." : "لو ما حطيتش صورة نستعمل ألوان متجرك."} />}
        <Input label={v.type === "hero" ? "العنوان الرئيسي" : "العنوان"} value={c.title} maxLength={60} onChange={set("title")} hint={v.type === "hero" ? "فاضي = اسم المتجر" : v.type === "banner" ? "يظهر فوق الصورة (اختياري)" : "فاضي = العنوان الافتراضي"} />
        {v.type === "hero" && (
          <>
            <Input label="العنوان الفرعي" value={c.subtitle} maxLength={120} onChange={set("subtitle")} />
            <Input label="نص زر التسوّق" value={c.ctaLabel} maxLength={24} onChange={set("ctaLabel")} hint="فاضي = «تسوّق الآن»" />
          </>
        )}
        {v.type === "banner" && <Input label="الرابط (اختياري)" dir="ltr" className="text-right" value={c.linkUrl} maxLength={300} onChange={set("linkUrl")} hint="مثال: /category/عطور أو https://…" />}
        {v.type === "text" && <Textarea label="النص" rows={5} maxLength={600} value={c.body} onChange={set("body")} hint={`${c.body.length}/600`} />}
      </div>
    </Modal>
  );
}

/** محرر أقسام الصفحة الرئيسية: ترتيب بالسحب، إخفاء/إظهار، إضافة بانرات ونصوص، وتعديل المحتوى. */
export function SectionsEditor({ initial, writable }: { initial: InitialSection[]; writable: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(() => initial.map(fromInitial));
  const [saved, setSaved] = useState(JSON.stringify(initial.map(fromInitial)));
  const [editing, setEditing] = useState<EditorSection | null>(null);
  const [adding, setAdding] = useState<SectionType>("banner");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(items) !== saved;

  const available = SECTION_TYPES.filter((t) => !SINGLE_SECTION_TYPES.includes(t) || !items.some((i) => i.type === t));
  const addType = available.includes(adding) ? adding : available[0];

  function save() {
    setError(null);
    start(async () => {
      const r = await saveSectionsAction(items.map((x) => ({
        id: x.id, type: x.type, isVisible: x.isVisible,
        config: { ...x.config, ...(x.type === "hero" || x.type === "banner" ? { imageMediaId: x.image?.id ?? null } : {}) },
      })));
      if (!r.ok) return setError(r.error);
      toast("تم حفظ الصفحة الرئيسية");
      notifyStoreSaved();
      router.refresh();
      setSaved(JSON.stringify(items));
    });
  }

  return (
    <div className="space-y-4">
      <SortableList
        className="space-y-2" items={items} getId={(x) => x.key} onReorder={(next) => writable && setItems(next)}
        render={(x, { isFirst, isLast, moveUp, moveDown, dragging }) => (
          <Card className={`flex items-center gap-3 p-3 transition-opacity ${dragging ? "opacity-50" : ""} ${x.isVisible ? "" : "bg-surface-2"}`}>
            <GripVertical className="hidden size-5 shrink-0 cursor-grab text-muted sm:block" aria-hidden />
            {x.image && <img src={x.image.url} alt="" className="size-12 shrink-0 rounded-md object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold">{SECTION_LABELS[x.type]}{!x.isVisible && <Badge><EyeOff className="size-3" aria-hidden /> مخفي</Badge>}</p>
              <p className="truncate text-sm text-muted">{sectionSummary(x)}</p>
            </div>
            <div className="flex shrink-0 items-center">
              <IconBtn label="تحريك لفوق" onClick={moveUp} disabled={isFirst || !writable}><ArrowUp className="size-4" /></IconBtn>
              <IconBtn label="تحريك لتحت" onClick={moveDown} disabled={isLast || !writable}><ArrowDown className="size-4" /></IconBtn>
              <IconBtn label={x.isVisible ? "إخفاء" : "إظهار"} onClick={() => setItems((l) => l.map((i) => (i.key === x.key ? { ...i, isVisible: !i.isVisible } : i)))} disabled={!writable}>{x.isVisible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</IconBtn>
              <IconBtn label="تعديل" onClick={() => setEditing({ ...x, key: x.key })} disabled={!writable}><Pencil className="size-4" /></IconBtn>
              <IconBtn label="حذف" onClick={() => setItems((l) => l.filter((i) => i.key !== x.key))} disabled={!writable}><Trash2 className="size-4 text-danger-fg" /></IconBtn>
            </div>
          </Card>
        )}
      />
      {items.length === 0 && <p className="rounded-lg border border-dashed border-line p-6 text-center text-muted">الصفحة الرئيسية فاضية. أضف قسم.</p>}

      {items.length < MAX_SECTIONS && addType && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-line p-3">
          <div className="min-w-44 flex-1"><Select label="إضافة قسم" value={addType} onChange={(e) => setAdding(e.target.value as SectionType)}>{available.map((t) => <option key={t} value={t}>{SECTION_LABELS[t]}</option>)}</Select></div>
          <Button variant="outline" disabled={!writable} onClick={() => setEditing({ key: newKey(), id: null, type: addType, isVisible: true, image: null, config: { title: "", subtitle: "", ctaLabel: "", linkUrl: "", body: "" } })}><Plus className="size-4" aria-hidden /> إضافة</Button>
        </div>
      )}

      {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p>}
      <div className="flex items-center gap-3">
        <Button loading={pending} disabled={!writable || !dirty} onClick={save}>حفظ الصفحة الرئيسية</Button>
        {dirty && <span className="text-sm text-muted">فيه تغييرات ما اتحفظتش</span>}
      </div>

      {editing && (
        <SectionForm key={editing.key} draft={editing} onCancel={() => setEditing(null)}
          onSave={(x) => { setItems((l) => (l.some((i) => i.key === x.key) ? l.map((i) => (i.key === x.key ? x : i)) : [...l, x])); setEditing(null); }} />
      )}
    </div>
  );
}

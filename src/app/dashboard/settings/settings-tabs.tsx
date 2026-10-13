"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { IdentityPicker } from "@/components/dashboard/identity-picker";
import { ImageUploader } from "@/components/dashboard/image-uploader";
import { Card, CardBody } from "@/components/ui/card";
import { Input, PhoneInput, Select, Textarea } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, type BusinessType, type StoreTemplate } from "@/lib/constants";
import { saveContactAction, saveGeneralAction, savePaymentAction, saveSeoAction } from "./actions";
import { DeliveryTab, type DeliveryProps } from "./delivery-tab";
import { PixelsTab, type PixelsProps } from "./pixels-tab";
import { Footer, useSave } from "./settings-shared";
import { WhatsappTab, type WhatsappProps } from "./whatsapp-tab";

type Media = { id: string; url: string } | null;
type Props = {
  writable: boolean; defaultTab: string; allTemplates: boolean; storeLink: string;
  general: { name: string; businessType: BusinessType; template: StoreTemplate; primary: string; accent: string; logo: Media };
  contact: Record<"contactPhone" | "whatsapp" | "email" | "address" | "instagram" | "tiktok" | "facebook" | "snapchat", string>;
  payment: { bankTransfer: boolean; bankName: string; accountHolder: string; accountNumber: string; note: string };
  seo: { seoTitle: string; seoDescription: string; og: Media };
  delivery: DeliveryProps;
  whatsapp: WhatsappProps;
  pixels: PixelsProps;
};

export function SettingsTabs(p: Props) {
  return (
    <Tabs
      defaultKey={p.defaultTab}
      items={[
        { key: "general", label: "عام وهوية", content: <General {...p} /> },
        { key: "contact", label: "التواصل", content: <Contact {...p} /> },
        { key: "payment", label: "الدفع", content: <Payment {...p} /> },
        { key: "delivery", label: "التوصيل", content: <DeliveryTab {...p.delivery} writable={p.writable} /> },
        { key: "whatsapp", label: "رسائل واتساب", content: <WhatsappTab {...p.whatsapp} writable={p.writable} /> },
        { key: "pixels", label: "Pixels", content: <PixelsTab {...p.pixels} writable={p.writable} /> },
        { key: "seo", label: "جوجل SEO", content: <Seo {...p} /> },
      ]}
    />
  );
}

function General({ general, writable, allTemplates, storeLink }: Props) {
  const [name, setName] = useState(general.name);
  const [type, setType] = useState(general.businessType);
  const [template, setTemplate] = useState(general.template);
  const [primary, setPrimary] = useState(general.primary);
  const [accent, setAccent] = useState(general.accent);
  const [logo, setLogo] = useState(general.logo);
  const { save, pending, error } = useSave(saveGeneralAction);
  return (
    <Card><CardBody>
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save({ name, businessType: type, template, primaryColor: primary, accentColor: accent, logoMediaId: logo?.id ?? null }); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="اسم المتجر" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <Select label="نوع النشاط" value={type} onChange={(e) => setType(e.target.value as BusinessType)}>
            {BUSINESS_TYPES.map((b) => <option key={b} value={b}>{BUSINESS_TYPE_LABELS[b]}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium">رابط المتجر</span>
          <p dir="ltr" className="rounded-md bg-surface-2 px-3 py-2.5 text-start text-sm">{storeLink}</p>
          <p className="text-sm text-muted">تغيير الرابط يتم عن طريق الدعم (علشان الروابط اللي شاركتها ما تنكسرش).</p>
        </div>
        <IdentityPicker logo={logo} onLogo={setLogo} template={template} onTemplate={setTemplate} primary={primary} accent={accent} onColors={(a, b) => { setPrimary(a); setAccent(b); }} allTemplates={allTemplates} />
        <Footer pending={pending} error={error} disabled={!writable || !name.trim()} />
      </form>
    </CardBody></Card>
  );
}

function Contact({ contact, writable }: Props) {
  const [v, setV] = useState(contact);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const { save, pending, error } = useSave(saveContactAction);
  return (
    <Card><CardBody>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(v); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <PhoneInput name="whatsapp" label="رقم واتساب" hint="يظهر في زر واتساب العائم ورسائل الطلبيات" value={v.whatsapp} onChange={set("whatsapp")} />
          <PhoneInput name="contactPhone" label="رقم الهاتف" hint="اختياري" value={v.contactPhone} onChange={set("contactPhone")} />
          <Input label="البريد الإلكتروني" type="email" value={v.email} onChange={set("email")} placeholder="name@example.com" />
        </div>
        <Textarea label="العنوان" rows={2} maxLength={200} value={v.address} onChange={set("address")} hint="مثال: طرابلس، شارع الجمهورية" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="إنستغرام" dir="ltr" className="text-right" value={v.instagram} onChange={set("instagram")} placeholder="username" />
          <Input label="تيك توك" dir="ltr" className="text-right" value={v.tiktok} onChange={set("tiktok")} placeholder="username" />
          <Input label="فيسبوك" dir="ltr" className="text-right" value={v.facebook} onChange={set("facebook")} placeholder="page-name أو رابط" />
          <Input label="سناب شات" dir="ltr" className="text-right" value={v.snapchat} onChange={set("snapchat")} placeholder="username" />
        </div>
        <Footer pending={pending} error={error} disabled={!writable} />
      </form>
    </CardBody></Card>
  );
}

function Payment({ payment, writable }: Props) {
  const [v, setV] = useState(payment);
  const { save, pending, error } = useSave(savePaymentAction);
  return (
    <Card><CardBody>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(v); }}>
        <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-3 text-sm font-medium"><CheckCircle2 className="size-5 text-success-fg" /> الدفع عند الاستلام (مفعّل دايماً)</div>
        <Toggle checked={v.bankTransfer} onChange={(bankTransfer) => setV({ ...v, bankTransfer })} label="تحويل مصرفي" hint="الزبون يحول المبلغ ويرفع إيصال التحويل" />
        {v.bankTransfer && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="اسم المصرف" value={v.bankName} maxLength={60} onChange={(e) => setV({ ...v, bankName: e.target.value })} />
            <Input label="صاحب الحساب" value={v.accountHolder} maxLength={80} onChange={(e) => setV({ ...v, accountHolder: e.target.value })} />
            <Input label="رقم الحساب / IBAN" dir="ltr" className="text-right" value={v.accountNumber} maxLength={60} onChange={(e) => setV({ ...v, accountNumber: e.target.value })} />
            <Input label="ملاحظة للزبون (اختياري)" value={v.note} maxLength={200} onChange={(e) => setV({ ...v, note: e.target.value })} />
          </div>
        )}
        <p className="text-sm text-muted">بوابات الدفع الإلكتروني المحلية تنضاف لاحقاً.</p>
        <Footer pending={pending} error={error} disabled={!writable} />
      </form>
    </CardBody></Card>
  );
}

function Seo({ seo, writable }: Props) {
  const [title, setTitle] = useState(seo.seoTitle);
  const [desc, setDesc] = useState(seo.seoDescription);
  const [og, setOg] = useState(seo.og);
  const { save, pending, error } = useSave(saveSeoAction);
  return (
    <Card><CardBody>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save({ seoTitle: title, seoDescription: desc, ogMediaId: og?.id ?? null }); }}>
        <Input label="عنوان المتجر في نتائج البحث" value={title} maxLength={70} onChange={(e) => setTitle(e.target.value)} hint={`${title.length}/70 · لو تركته فاضي نستعمل اسم المتجر`} />
        <Textarea label="وصف المتجر" rows={3} maxLength={160} value={desc} onChange={(e) => setDesc(e.target.value)} hint={`${desc.length}/160 · جملة أو جملتين تعرّف بمتجرك`} />
        <ImageUploader label="صورة المشاركة (اختياري)" hint="تظهر لما تشارك الرابط في واتساب وفيسبوك. الأفضل صورة عرضية." kind="banner" shape="wide" value={og} onChange={setOg} />
        <Footer pending={pending} error={error} disabled={!writable} />
      </form>
    </CardBody></Card>
  );
}

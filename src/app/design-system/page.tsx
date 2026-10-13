import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Skeleton, Spinner } from "@/components/ui/feedback";
import { Input, PasswordInput, PhoneInput, Select, Textarea } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { DemoInteractive } from "./demo-interactive";

export const metadata: Metadata = { title: "نظام التصميم", robots: { index: false } };

const swatches = [
  ["كحلي", "bg-navy"], ["ذهبي", "bg-gold"], ["تركوازي", "bg-teal"], ["فحمي", "bg-charcoal"],
  ["نجاح", "bg-success"], ["خطأ", "bg-danger"],
] as const;

// صفحة معاينة للمطورين فقط (مش في الإنتاج)
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <header className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </header>
        <h1 className="text-3xl">نظام التصميم</h1>

        <Card><CardHeader title="الألوان" /><CardBody className="flex flex-wrap gap-3">
          {swatches.map(([name, cls]) => (
            <div key={name} className="text-center text-sm"><div className={`${cls} size-16 rounded-lg shadow-soft ring-1 ring-line`} />{name}</div>
          ))}
        </CardBody></Card>

        <Card><CardHeader title="الخطوط" /><CardBody className="space-y-2">
          <h2 className="text-2xl">عنوان بخط Alexandria</h2>
          <p>نص أساسي بخط IBM Plex Sans Arabic. الأسعار: {formatMoney(12_500)} و{formatMoney(49_000)}</p>
        </CardBody></Card>

        <Card><CardHeader title="الأزرار" /><CardBody className="flex flex-wrap gap-3">
          <Button>رئيسي</Button><Button variant="secondary">ثانوي</Button><Button variant="outline">إطار</Button>
          <Button variant="ghost">شفاف</Button><Button variant="danger">حذف</Button><Button loading>جاري الحفظ</Button><Button disabled>معطّل</Button>
          <Button size="sm">صغير</Button><Button size="lg">كبير</Button>
        </CardBody></Card>

        <Card><CardHeader title="الحقول" /><CardBody className="grid gap-4 sm:grid-cols-2">
          <Input label="الاسم" placeholder="اسم المتجر" />
          <PhoneInput />
          <PasswordInput label="كلمة السر" />
          <Select label="المدينة"><option>طرابلس</option><option>بنغازي</option><option>مصراتة</option></Select>
          <Input label="مع خطأ" error="هذا الحقل مطلوب" defaultValue="" />
          <Textarea label="ملاحظات" className="sm:col-span-2" />
        </CardBody></Card>

        <Card><CardHeader title="الشارات (حالات الطلبية)" /><CardBody className="flex flex-wrap gap-2">
          <Badge tone="teal">{ORDER_STATUS_LABELS.new}</Badge><Badge tone="gold">{ORDER_STATUS_LABELS.confirmed}</Badge>
          <Badge tone="navy">{ORDER_STATUS_LABELS.with_courier}</Badge><Badge tone="success">{ORDER_STATUS_LABELS.delivered}</Badge>
          <Badge tone="danger">{ORDER_STATUS_LABELS.returned}</Badge><Badge>{ORDER_STATUS_LABELS.cancelled}</Badge>
        </CardBody></Card>

        <Table>
          <THead><TR><TH>الطلبية</TH><TH>الزبون</TH><TH>المبلغ</TH><TH>الحالة</TH></TR></THead>
          <TBody>
            <TR><TD>#1001</TD><TD>سالم</TD><TD>{formatMoney(85_500)}</TD><TD><Badge tone="teal">جديدة</Badge></TD></TR>
            <TR><TD>#1002</TD><TD>مريم</TD><TD>{formatMoney(42_000)}</TD><TD><Badge tone="success">تم التوصيل</Badge></TD></TR>
          </TBody>
        </Table>

        <Card><CardHeader title="تحميل وحالة فاضية" /><CardBody className="space-y-4">
          <div className="flex items-center gap-3"><Spinner /><Skeleton className="h-4 w-48" /></div>
          <EmptyState icon={<Inbox className="size-6" />} title="ما فيه طلبيات" description="الطلبيات الجديدة تظهر هنا." action={<Button size="sm">إضافة منتج</Button>} />
        </CardBody></Card>

        <DemoInteractive />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { getDb } from "@/db";
import { formatDateTimeYear } from "@/lib/datetime";
import { listAudit } from "@/server/admin/settings";

export const metadata: Metadata = { title: "سجل النشاط" };

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, string> = {
  "subscription.payment": "تسجيل دفعة", "store.extend_trial": "تمديد التجربة", "store.suspend": "إيقاف متجر", "store.unsuspend": "تفعيل متجر", "store.change_plan": "تغيير باقة متجر",
  "plan.create": "إنشاء باقة", "plan.update": "تعديل باقة", "announcement.create": "إنشاء إعلان", "announcement.update": "تعديل إعلان", "announcement.delete": "حذف إعلان",
  "site.content": "تعديل محتوى الموقع", "site.content_reset": "إعادة محتوى الموقع للأصل", "platform.settings": "تعديل إعدادات المنصة",
  "domain.add": "إضافة دومين خاص", "domain.verify": "تحقق دومين خاص", "domain.remove": "حذف دومين خاص", "domain.admin_status": "اعتماد دومين يدوياً",
  "user.reset_password": "إعادة تعيين كلمة سر",
  "password.reset_issue": "إصدار رابط استرجاع كلمة سر", "password.reset_dismiss": "تجاهل طلب استرجاع كلمة سر", "password.reset_done": "استرجاع كلمة سر (تم)",
  "staff.add": "إضافة موظف", "staff.remove": "حذف موظف", "staff.role": "تغيير صلاحية موظف", "staff.password": "تغيير كلمة سر موظف",
};

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const sp = await searchParams;
  const action = sp.action && sp.action in ACTIONS ? sp.action : undefined;
  const r = await listAudit(getDb(), { action, page: Number(sp.page) || 1 });
  const href = (page: number) => `?${new URLSearchParams({ ...(action ? { action } : {}), page: String(page) })}`;

  return (
    <>
      <div><h1 className="text-2xl">سجل النشاط</h1><p className="text-muted">كل العمليات الحساسة على المنصة ({r.total}).</p></div>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3">
        <div className="min-w-56 flex-1"><Select name="action" label="نوع العملية" defaultValue={action ?? ""}><option value="">الكل</option>{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
        <Button type="submit" variant="outline">تصفية</Button>
      </form>
      {r.items.length === 0 ? <EmptyState icon={<ScrollText className="size-6" />} title="ما فيش عمليات" /> : (
        <ul className="space-y-2">
          {r.items.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-surface p-4 text-sm shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{ACTIONS[a.action] ?? a.action}</p>
                <span className="text-xs text-muted">{formatDateTimeYear(a.createdAt)}</span>
              </div>
              <p className="text-muted">{a.actor ?? "النظام"}{a.storeId && a.storeName ? <> · <Link href={`/admin/stores/${a.storeId}`} className="text-link">{a.storeName}</Link></> : null}</p>
              {a.meta && Object.keys(a.meta).length > 0 && <p dir="ltr" className="mt-1 break-all text-start text-xs text-muted">{JSON.stringify(a.meta)}</p>}
            </li>
          ))}
        </ul>
      )}
      {r.pageCount > 1 && (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 text-sm">
          {r.page > 1 && <Link className="rounded-md border border-line px-3 py-2" href={href(r.page - 1)}>السابق</Link>}
          <span className="text-muted">صفحة {r.page} من {r.pageCount}</span>
          {r.page < r.pageCount && <Link className="rounded-md border border-line px-3 py-2" href={href(r.page + 1)}>التالي</Link>}
        </nav>
      )}
    </>
  );
}

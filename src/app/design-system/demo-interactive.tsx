"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { LockedButton, UpgradeDialog } from "@/components/ui/locked";
import { Toggle } from "@/components/ui/toggle";
import { BarChart3, ShoppingCart } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

export function DemoInteractive() {
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [on, setOn] = useState(true);
  const { toast } = useToast();
  return (
    <Card>
      <CardHeader title="نافذة، درج، ميزة مقفولة، إشعارات، تبويبات" />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setOpen(true)}>افتح نافذة</Button>
          <Button variant="outline" onClick={() => setDrawer(true)}>افتح درج</Button>
          <Button variant="outline" onClick={() => setUpgrade(true)}>نافذة «رقّي باقتك»</Button>
          <Button variant="outline" onClick={() => toast("تم الحفظ", "success")}>تم الحفظ</Button>
          <Button variant="outline" onClick={() => toast("طلبية جديدة وصلتك", "info")}>طلبية جديدة</Button>
          <Button variant="outline" onClick={() => toast("صار خطأ عندنا. جرّب مرة ثانية، ولو تكرر كلمنا.", "error")}>خطأ</Button>
        </div>
        <div className="max-w-xs space-y-2">
          <p className="text-sm text-muted">عنصر قائمة مقفول بالباقة:</p>
          <LockedButton info={{ title: "السلات المتروكة", benefit: "رجّع الزباين اللي ما كملوش الطلب برسالة واتساب جاهزة.", planName: "ست شهور" }} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium hover:bg-surface-2"><ShoppingCart className="size-5" aria-hidden />السلات المتروكة</LockedButton>
          <LockedButton info={{ title: "التقارير المتقدمة", benefit: "أرباحك الحقيقية وأكثر المنتجات مبيعاً، مع تصدير Excel." }} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium hover:bg-surface-2"><BarChart3 className="size-5" aria-hidden />التقارير المتقدمة</LockedButton>
        </div>
        <div className="max-w-xs"><Toggle label="الوحدة شغّالة" hint="الطفي ما يمسحش البيانات" checked={on} onChange={setOn} /></div>
        <Tabs items={[
          { key: "a", label: "المنتجات", content: <p>محتوى المنتجات</p> },
          { key: "b", label: "الطلبيات", content: <p>محتوى الطلبيات</p> },
          { key: "c", label: "الزبائن", content: <p>محتوى الزبائن</p> },
        ]} />
        <Drawer open={drawer} onClose={() => setDrawer(false)} title="فلترة الطلبيات" footer={<Button onClick={() => setDrawer(false)}>طبّق</Button>}>
          <p className="text-muted">محتوى الدرج: فلاتر، تفاصيل سريعة، أو نموذج قصير.</p>
        </Drawer>
        <UpgradeDialog open={upgrade} onClose={() => setUpgrade(false)} info={{ title: "الأدوار المخصصة", benefit: "اختار صلاحيات كل موظف وحدة وحدة.", planName: "سنوية" }} />
        <Modal open={open} onClose={() => setOpen(false)} title="تأكيد الحذف"
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button><Button variant="danger" onClick={() => { setOpen(false); toast("تم الحذف"); }}>حذف</Button></>}>
          <p>حذف هذا المنتج؟ ما ينفع ترجعه.</p>
        </Modal>
      </CardBody>
    </Card>
  );
}

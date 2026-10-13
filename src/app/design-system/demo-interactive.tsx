"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

export function DemoInteractive() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  return (
    <Card>
      <CardHeader title="نافذة، إشعارات، تبويبات" />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setOpen(true)}>افتح نافذة</Button>
          <Button variant="outline" onClick={() => toast("تم الحفظ", "success")}>تم الحفظ</Button>
          <Button variant="outline" onClick={() => toast("طلبية جديدة وصلتك", "info")}>طلبية جديدة</Button>
          <Button variant="outline" onClick={() => toast("صار خطأ، جرّب مرة ثانية", "error")}>خطأ</Button>
        </div>
        <Tabs items={[
          { key: "a", label: "المنتجات", content: <p>محتوى المنتجات</p> },
          { key: "b", label: "الطلبيات", content: <p>محتوى الطلبيات</p> },
          { key: "c", label: "الزبائن", content: <p>محتوى الزبائن</p> },
        ]} />
        <Modal open={open} onClose={() => setOpen(false)} title="تأكيد الحذف"
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button><Button variant="danger" onClick={() => { setOpen(false); toast("تم الحذف"); }}>حذف</Button></>}>
          <p>متأكد تبي تمسح هذا المنتج؟ ما تقدرش ترجعه.</p>
        </Modal>
      </CardBody>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { createWallScreenAction, revokeWallScreenAction } from "../actions";

export function TvManager({ screens, writable }: { screens: { id: string; name: string; lastSeen: number | null }[]; writable: boolean }) {
  const [name, setName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const { act, pending, error } = useAct();
  return (
    <div className="space-y-4">
      {writable && (
        <Card><CardHeader title="رابط جديد" /><CardBody className="space-y-3">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await createWallScreenAction(name || "شاشة الحائط"); if (r.ok) setLink(`${window.location.origin}/tv#t=${r.data.token}`); return r; }, "تم إنشاء الرابط", () => setName("")); }}>
            <Input label="اسم الشاشة" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="تلفزيون الصالة" /><Button type="submit" loading={pending}>أنشئ الرابط</Button>
          </form>
          {link && <div className="rounded-xl bg-gold/15 p-3 text-sm"><p className="font-semibold">انسخ الرابط الحين (ما يتعرضش مرة ثانية):</p><p className="mt-1 select-all break-all font-mono text-xs" dir="ltr">{link}</p></div>}
          {error && <p role="alert" className={errorClass}>{error}</p>}
        </CardBody></Card>
      )}
      <Card><CardHeader title="الشاشات" />
        {screens.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش شاشات.</p> : <ul className="divide-y divide-line text-sm">{screens.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3"><span><b>{s.name}</b> <span className="text-muted">{s.lastSeen ? `· آخر ظهور ${new Date(s.lastSeen).toLocaleTimeString("ar-LY", { hour: "numeric", minute: "2-digit" })}` : "· ما اتفتحتش"}</span></span>
            {writable && <Button size="sm" variant="danger" onClick={() => { if (confirm(`نلغوا رابط «${s.name}»؟`)) act(() => revokeWallScreenAction(s.id), "اتلغى الرابط"); }}>إلغاء الرابط</Button>}</li>))}</ul>}
      </Card>
    </div>
  );
}

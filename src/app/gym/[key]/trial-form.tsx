"use client";

import { useState } from "react";
import { Input } from "@/components/ui/field";
import { waLink } from "@/lib/whatsapp";

export function TrialForm({ wa, shop }: { wa: string; shop: string }) {
  const [f, setF] = useState({ name: "", phone: "" });
  const ok = f.name.trim().length >= 2 && f.phone.trim().length >= 6;
  return (
    <form className="grid gap-3 sm:grid-cols-3 sm:items-end" onSubmit={(e) => { e.preventDefault(); if (ok) window.open(waLink(wa, `السلام عليكم، أنا ${f.name.trim()} (${f.phone.trim()}). نبي زيارة تجريبية في ${shop}.`), "_blank", "noopener,noreferrer"); }}>
      <Input label="الاسم" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Input label="رقم الهاتف" dir="ltr" inputMode="tel" value={f.phone} maxLength={20} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <button type="submit" disabled={!ok} className="h-11 rounded-md bg-gold px-5 font-semibold text-navy disabled:opacity-50">احجز زيارة عبر واتساب</button>
    </form>
  );
}

"use client";

// لوحة الدخول (الاستقبال والكشك): حقل للقارئ/الهاتف + كاميرا، نتيجة كبيرة بلون وصوت مختلف للمقبول والمرفوض
import { useEffect, useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { CameraScanner } from "@/components/scan/camera-scanner";
import { Button } from "@/components/ui/button";

export type Shown = { ok: boolean; name: string | null; text: string; sub?: string | null; at: number };

function tone(ok: boolean) {
  try {
    const ctx = new AudioContext(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = ok ? "sine" : "square"; o.frequency.value = ok ? 880 : 220; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.25 : 0.7));
    o.onended = () => void ctx.close();
  } catch { /* المتصفح ما يدعمش الصوت */ }
}

export function CheckinPanel({ onCheck, camera, big, hint }: { onCheck: (code: string) => Promise<Shown>; camera: boolean; big?: boolean; hint?: string }) {
  const [code, setCode] = useState("");
  const [shown, setShown] = useState<Shown | null>(null);
  const [cam, setCam] = useState(false);
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  // النتيجة تختفي بعد 6 ثواني
  useEffect(() => { if (!shown) return; const id = setTimeout(() => setShown(null), 6000); return () => clearTimeout(id); }, [shown]);
  const run = (c: string) => start(async () => { const r = await onCheck(c); tone(r.ok); setShown(r); setCode(""); input.current?.focus(); });
  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) run(code.trim()); }}>
        <input ref={input} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" inputMode="text" dir="ltr" aria-label="رقم الهاتف أو امسح QR" placeholder={hint ?? "امسح QR أو اكتب رقم الهاتف"}
          className={`min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 outline-none focus:border-gold focus:ring-2 focus:ring-gold/30 ${big ? "h-16 text-2xl" : "h-12 text-lg"}`} />
        <Button type="submit" loading={busy} size={big ? "lg" : "md"}>دخول</Button>
        {camera && <Button type="button" variant="outline" size={big ? "lg" : "md"} onClick={() => setCam(true)} aria-label="امسح بالكاميرا"><Camera className="size-5" /></Button>}
      </form>
      <div aria-live="assertive" className={`flex min-h-40 flex-col items-center justify-center rounded-3xl p-6 text-center transition-colors ${shown ? (shown.ok ? "bg-success/20" : "bg-danger/15") : "bg-surface-2"}`}>
        {shown ? (
          <>
            <p className={`font-heading font-bold ${big ? "text-5xl" : "text-3xl"}`}>{shown.ok ? `أهلاً ${shown.name ?? ""}` : shown.name ? `${shown.name}` : "ما اتعرفش"}</p>
            <p className={`mt-2 ${big ? "text-3xl" : "text-xl"} ${shown.ok ? "text-success-fg" : "text-danger-fg"}`}>{shown.text}</p>
            {shown.sub && <p className="mt-1 text-lg text-muted">{shown.sub}</p>}
          </>
        ) : <p className="text-lg text-muted">جاهز للدخول…</p>}
      </div>
      <CameraScanner open={cam} onClose={() => setCam(false)} onCode={(c) => { setCam(false); run(c); }} title="امسح بطاقة العضو" />
    </div>
  );
}

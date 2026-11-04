"use client";

// شاشة الزبون: تسمع للكاشير على نفس الجهاز (BroadcastChannel) وتعرض الأصناف والإجمالي والعروض، وبعد الدفع الباقي وكلمة شكر.
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { fmtKg } from "./market-dialogs";
import type { DisplayMessage } from "./use-pos";

const m = (n: number) => formatMoney(n);

export function CustomerDisplay() {
  const [cart, setCart] = useState<Extract<DisplayMessage, { kind: "cart" }> | null>(null);
  const [paid, setPaid] = useState<Extract<DisplayMessage, { kind: "paid" }> | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("rukn-pos-display");
    let timer: ReturnType<typeof setTimeout> | null = null;
    ch.onmessage = (e: MessageEvent<DisplayMessage>) => {
      const msg = e.data;
      if (msg?.kind === "paid") {
        setPaid(msg);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setPaid(null), 12_000);
      } else if (msg?.kind === "cart") {
        setCart(msg);
        if (msg.lines.length) { setPaid(null); if (timer) clearTimeout(timer); }
      }
    };
    return () => { ch.close(); if (timer) clearTimeout(timer); };
  }, []);

  const saved = cart ? cart.lines.reduce((a, l) => a + l.promo, 0) : 0;
  return (
    <main className="flex min-h-dvh flex-col bg-navy p-6 text-white" dir="rtl">
      <header className="flex items-center justify-between border-b border-white/15 pb-4">
        <h1 className="font-heading text-3xl">{cart?.shop || paid?.shop || "أهلاً بيك"}</h1>
        {cart?.customer && <p className="text-lg text-white/80">مرحبا {cart.customer}</p>}
      </header>

      {paid ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center" aria-live="polite">
          <p className="text-2xl text-white/80">الإجمالي {m(paid.total)}</p>
          {paid.change > 0 && <p className="font-heading text-6xl font-bold text-gold">الباقي: {m(paid.change)}</p>}
          <p className="text-3xl">شكراً لزيارتك 🌙</p>
          {paid.message && <p className="max-w-xl whitespace-pre-line text-lg text-white/70">{paid.message}</p>}
        </section>
      ) : !cart?.lines.length ? (
        <section className="flex flex-1 items-center justify-center text-center"><p className="text-3xl text-white/70">نورتنا! تفضّل…</p></section>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-white/10 overflow-y-auto py-2 text-xl" aria-live="polite">
            {cart.lines.map((l, i) => (
              <li key={i} className="flex items-center gap-4 py-3">
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="tabular-nums text-white/70">{l.isWeighed ? fmtKg(l.quantity) : `× ${l.quantity}`}</span>
                <span className="w-36 text-end font-semibold tabular-nums">{m(l.total)}</span>
              </li>
            ))}
          </ul>
          <footer className="space-y-2 border-t border-white/15 pt-4">
            {saved > 0 && <p className="flex justify-between text-xl text-gold"><span>وفّرت من العروض</span><span className="tabular-nums">{m(saved)}</span></p>}
            <p className="flex items-baseline justify-between"><span className="text-2xl">الإجمالي</span><span className="font-heading text-6xl font-bold tabular-nums">{m(cart.total)}</span></p>
          </footer>
        </>
      )}
    </main>
  );
}

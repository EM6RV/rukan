"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media-url";
import { formatMoney } from "@/lib/money";
import { useStore } from "./store-context";
import { getKit } from "./templates";

type Hit = { slug: string; name: string; price: number; thumb: string | null };

/** مربع البحث مع اقتراحات فورية (بعد حرفين) */
export function SearchBox({ defaultValue }: { defaultValue: string }) {
  const store = useStore();
  const kit = getKit(store.template);
  const [q, setQ] = useState(defaultValue);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { timer.current = setTimeout(() => setHits([]), 0); return () => clearTimeout(timer.current); }
    const ctl = new AbortController();
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${store.href("/suggest")}?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal });
        if (res.ok) setHits(((await res.json()) as { items: Hit[] }).items);
      } catch { /* تجاهل: الاقتراحات إضافة بس */ }
    }, 220);
    return () => { clearTimeout(timer.current); ctl.abort(); };
  }, [q, store]);

  return (
    <div className="relative">
      <form action={store.href("/search")} role="search" className="flex gap-2">
        <input name="q" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="ابحث عن منتج…" aria-label="بحث" autoComplete="off" role="combobox" aria-expanded={open && hits.length > 0} aria-controls="search-hits" className={kit.cls.input} />
        <button className={kit.cls.btn} aria-label="بحث"><Search className="size-5" /></button>
      </form>
      {open && hits.length > 0 && (
        <ul id="search-hits" role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-xl border border-(--sp-line) bg-white shadow-lg">
          {hits.map((h) => (
            <li key={h.slug} role="option" aria-selected={false}>
              <Link href={store.href(`/product/${encodeURIComponent(h.slug)}`)} className={cn("flex items-center gap-3 px-3 py-2 hover:bg-(--sp-soft)")}>
                {h.thumb ? <img src={mediaUrl(h.thumb, 96)} alt="" className="size-10 rounded object-cover" /> : <span className="size-10 rounded bg-(--sp-soft)" />}
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                <span className="text-sm text-(--sp-muted)">{formatMoney(h.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

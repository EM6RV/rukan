"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Loader2, Package, Search, ShoppingBag, User } from "lucide-react";
import type { NavItem } from "@/lib/dashboard-nav";
import type { SearchHit } from "@/server/dashboard-search";
import { cn } from "@/lib/cn";
import { searchDashboardAction } from "@/app/dashboard/search-actions";
import { NAV_ICONS } from "./nav";

type Row = { key: string; href: string; title: string; subtitle?: string; icon: React.ReactNode; section: string };
const HIT_ICON = { product: <Package className="size-4" />, order: <ShoppingBag className="size-4" />, customer: <User className="size-4" /> };
const HIT_SECTION = { order: "طلبيات", product: "منتجات", customer: "زبائن" };
const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

/** لوحة الأوامر: Ctrl+K (أو ⌘K) أو زر البحث. صفحات من غير سيرفر، والمنتجات/الطلبيات/الزبائن من السيرفر. */
export function CommandPalette({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sel, setSel] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    const onOpen = () => setOpen(true);
    // أزرار البحث في مكونات السيرفر: <button data-palette-open>
    const onClick = (e: MouseEvent) => { if ((e.target as Element | null)?.closest?.("[data-palette-open]")) setOpen(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("rukn:palette", onOpen);
    document.addEventListener("click", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("rukn:palette", onOpen); document.removeEventListener("click", onClick); };
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // بحث السيرفر بعد ما يوقف الكتابة شوية
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = setTimeout(() => start(async () => {
      const r = await searchDashboardAction(term);
      setHits(r.ok ? r.data : []);
    }), 220);
    return () => clearTimeout(id);
  }, [q]);

  const rows = useMemo<Row[]>(() => {
    const term = norm(q.trim());
    const pages = items
      .filter((i) => !term || norm(`${i.label} ${i.keywords ?? ""}`).includes(term))
      .slice(0, term ? 6 : 8)
      .map((i): Row => { const Icon = NAV_ICONS[i.icon]; return { key: i.href, href: i.href, title: i.label, icon: <Icon className="size-4" />, section: "الصفحات" }; });
    const found = term.length >= 2 ? hits.map((h): Row => ({ key: `${h.kind}-${h.id}`, href: h.href, title: h.title, subtitle: h.subtitle, icon: HIT_ICON[h.kind], section: HIT_SECTION[h.kind] })) : [];
    return [...found, ...pages];
  }, [q, hits, items]);

  const go = (r: Row | undefined) => {
    if (!r) return;
    setOpen(false);
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(rows.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(rows[sel]); }
  };

  const close = () => { setOpen(false); setQ(""); setHits([]); setSel(0); };
  let lastSection = "";

  return (
    <dialog
      ref={ref} onClose={close} onClick={(e) => e.target === ref.current && setOpen(false)} aria-label="البحث السريع"
      className="mx-auto mt-[10vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-lift backdrop:bg-navy/40 open:animate-[modal-in_0.15s_ease-out]"
    >
      {open && (
        <div onKeyDown={onKeyDown} className="w-full">
          <div className="flex w-full items-center gap-2 border-b border-line px-4">
            {pending ? <Loader2 className="size-5 animate-spin text-muted" aria-hidden /> : <Search className="size-5 text-muted" aria-hidden />}
            <input
              autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
              role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={rows[sel] ? `pal-${sel}` : undefined} aria-label="ابحث"
              placeholder="ابحث عن صفحة، منتج، رقم طلبية، أو هاتف زبون…" className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
            />
            <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
          </div>
          <ul id="palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
            {rows.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">{pending ? "نبحث…" : "ما لقيناش حاجة. جرّب كلمة ثانية."}</li>}
            {rows.map((r, i) => {
              const header = r.section !== lastSection ? (lastSection = r.section) : null;
              return (
                <li key={r.key} role="presentation">
                  {header && <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted">{header}</p>}
                  <div
                    id={`pal-${i}`} role="option" aria-selected={i === sel} onMouseMove={() => setSel(i)} onClick={() => go(r)}
                    className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5", i === sel && "bg-surface-2")}
                  >
                    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line text-muted">{r.icon}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.title}</span>{r.subtitle && <span className="block truncate text-xs text-muted" dir="auto">{r.subtitle}</span>}</span>
                    {i === sel && <CornerDownLeft className="size-4 text-muted" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </dialog>
  );
}

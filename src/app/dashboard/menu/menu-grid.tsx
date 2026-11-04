"use client";

import Link from "next/link";
import { useState } from "react";
import { Clock, Search } from "lucide-react";
import { NAV_GROUPS, type NavItem } from "@/lib/dashboard-nav";
import { NAV_ICONS, useRecent } from "@/components/dashboard/nav";

const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

/** صفحة «القائمة» في الموبايل: بحث في الصفحات، آخر صفحات فتحتها، ومربعات مقسمة بعناوين */
export function MenuGrid({ items }: { items: NavItem[] }) {
  const [q, setQ] = useState("");
  const recent = useRecent();
  const term = norm(q.trim());
  const match = (i: NavItem) => !term || norm(`${i.label} ${i.keywords ?? ""}`).includes(term);
  const groups = [{ key: null, title: "عام" }, ...NAV_GROUPS].map((g) => ({ ...g, list: items.filter((i) => i.group === g.key && match(i)) })).filter((g) => g.list.length);

  return (
    <div className="space-y-6">
      <label className="flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-fg/40">
        <Search className="size-5 text-muted" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في الصفحات…" aria-label="ابحث في الصفحات" className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
      </label>

      {!term && recent.length > 0 && (
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted"><Clock className="size-4" aria-hidden />آخر صفحات فتحتها</h2>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {recent.map((r) => (
              <li key={r.href} className="shrink-0"><Link href={r.href} className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-fg/25">{r.title}</Link></li>
            ))}
          </ul>
        </section>
      )}

      {groups.length === 0 && <p className="py-10 text-center text-muted">ما فيش صفحة بالاسم هذا.</p>}
      {groups.map((g) => (
        <section key={g.key ?? "top"} aria-labelledby={`g-${g.key ?? "top"}`}>
          <h2 id={`g-${g.key ?? "top"}`} className="mb-2 text-sm font-semibold text-muted">{g.title}</h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {g.list.map((it) => {
              const Icon = NAV_ICONS[it.icon];
              return (
                <li key={it.href}>
                  <Link href={it.href} className="relative flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface p-2 text-center text-[13px] font-medium leading-tight transition-colors hover:border-fg/25 active:bg-surface-2">
                    <Icon className="size-6" aria-hidden />
                    {it.label}
                    {!!it.badge && <span aria-label={`${it.badge} جديدة`} className="absolute top-2 end-2 min-w-5 rounded-full bg-fg px-1 text-center text-[11px] font-bold leading-5 text-bg">{it.badge > 99 ? "99+" : it.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

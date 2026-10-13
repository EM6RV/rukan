"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

export type TabItem = { key: string; label: string; content: React.ReactNode };

export function Tabs({ items, defaultKey, className }: { items: TabItem[]; defaultKey?: string; className?: string }) {
  const [active, setActive] = useState(defaultKey ?? items[0]?.key);
  const uid = useId();

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    // في RTL السهم اليمين = السابق واليسار = التالي
    const dir = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = items[(index + dir + items.length) % items.length]!;
    setActive(next.key);
    document.getElementById(`${uid}-tab-${next.key}`)?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((t, i) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              id={`${uid}-tab-${t.key}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                selected ? "border-gold text-fg" : "border-transparent text-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {items.map((t) => (
        <div key={t.key} id={`${uid}-panel-${t.key}`} role="tabpanel" aria-labelledby={`${uid}-tab-${t.key}`} hidden={t.key !== active} className="pt-5">
          {t.key === active && t.content}
        </div>
      ))}
    </div>
  );
}

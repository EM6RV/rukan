"use client";

import { useState } from "react";

export type SortableRenderArgs = {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  moveUp: () => void;
  moveDown: () => void;
  dragging: boolean;
};

export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * قائمة قابلة للترتيب: سحب وإفلات (ديسكتوب) + أزرار فوق/تحت (موبايل وإمكانية الوصول).
 * الترتيب الجديد يرجع عبر onReorder.
 */
export function SortableList<T>({
  items, getId, onReorder, render, className, as: Tag = "ul", trailing,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  render: (item: T, args: SortableRenderArgs) => React.ReactNode;
  className?: string;
  as?: "ul" | "div";
  /** عناصر إضافية تظهر بعد القائمة داخل نفس الحاوية (مثلاً زر «إضافة») */
  trailing?: React.ReactNode;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const Item = Tag === "ul" ? "li" : "div";

  return (
    <Tag className={className}>
      {items.map((item, index) => (
        <Item
          key={getId(item)}
          draggable
          onDragStart={(e: React.DragEvent) => { setDragIndex(index); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", getId(item)); }}
          onDragOver={(e: React.DragEvent) => { if (dragIndex !== null) { e.preventDefault(); setOverIndex(index); } }}
          onDrop={(e: React.DragEvent) => { e.preventDefault(); if (dragIndex !== null) onReorder(reorder(items, dragIndex, index)); setDragIndex(null); setOverIndex(null); }}
          onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
          data-drop-target={overIndex === index && dragIndex !== null && dragIndex !== index ? "true" : undefined}
          className={overIndex === index && dragIndex !== null && dragIndex !== index ? "outline-2 outline-dashed outline-gold" : undefined}
        >
          {render(item, {
            index,
            isFirst: index === 0,
            isLast: index === items.length - 1,
            moveUp: () => onReorder(reorder(items, index, index - 1)),
            moveDown: () => onReorder(reorder(items, index, index + 1)),
            dragging: dragIndex === index,
          })}
        </Item>
      ))}
      {trailing}
    </Tag>
  );
}

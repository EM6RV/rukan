import type { Kit } from "./types";

// classes القوالب (ملف محايد: يشتغل على السيرفر والعميل، بخلاف ملفات "use client")

export const simpleCls: Kit["cls"] = {
  page: "bg-white text-(--sp)",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-(--sp) px-7 text-[15px] font-semibold text-(--sp-fg) transition-all hover:opacity-90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-(--sp) px-7 text-[15px] font-semibold transition-colors hover:bg-(--sp-soft) disabled:opacity-50",
  chip: "rounded-full border border-(--sp-line) px-4 py-2 text-sm font-medium transition-colors hover:border-(--sp)",
  chipOn: "border-(--sp) bg-(--sp) text-(--sp-fg)",
  input: "h-12 w-full rounded-xl border border-(--sp-line) bg-white px-4 text-[15px] focus:border-(--sa) focus:outline-none focus:ring-2 focus:ring-(--sa)/30",
  panel: "rounded-2xl border border-(--sp-line) bg-white p-5",
  productGrid: "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4",
  heading: "text-2xl font-bold md:text-3xl",
  badge: "rounded-full bg-(--sa) px-2.5 py-1 text-xs font-bold text-(--sa-fg)",
  imageFrame: "rounded-2xl overflow-hidden bg-(--sp-soft)",
};

export const elegantCls: Kit["cls"] = {
  page: "bg-[#FBF8F3] text-(--sp) font-light",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-13 items-center justify-center gap-2 bg-(--sp) px-10 text-sm tracking-[0.15em] text-(--sp-fg) transition-opacity hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-13 items-center justify-center gap-2 border border-(--sp) px-10 text-sm tracking-[0.15em] transition-colors hover:bg-(--sp) hover:text-(--sp-fg) disabled:opacity-50",
  chip: "border border-(--sp-line) px-4 py-2 text-sm tracking-wide transition-colors hover:border-(--sp)",
  chipOn: "border-(--sp) bg-(--sp) text-(--sp-fg)",
  input: "h-13 w-full border-0 border-b border-(--sp-line) bg-transparent px-1 text-[15px] focus:border-(--sa) focus:outline-none",
  panel: "border border-(--sp-line) bg-white p-6",
  productGrid: "grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-3 lg:gap-x-8",
  heading: "text-3xl font-light tracking-[0.1em] md:text-4xl",
  badge: "border border-(--sa) px-2.5 py-0.5 text-xs tracking-wider text-(--sa-text)",
  imageFrame: "bg-white",
};

export const boldCls: Kit["cls"] = {
  page: "bg-white text-(--sp) font-medium",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-13 items-center justify-center gap-2 border-4 border-(--sp) bg-(--sa) px-8 text-lg font-black text-(--sa-fg) shadow-[4px_4px_0_var(--sp)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_var(--sp)] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-13 items-center justify-center gap-2 border-4 border-(--sp) bg-white px-8 text-lg font-black shadow-[4px_4px_0_var(--sp)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_var(--sp)] disabled:opacity-50",
  chip: "border-2 border-(--sp) px-4 py-2 text-sm font-extrabold transition-colors hover:bg-(--sa-soft)",
  chipOn: "bg-(--sp) text-(--sp-fg) shadow-[3px_3px_0_var(--sa)]",
  input: "h-13 w-full border-2 border-(--sp) bg-white px-4 text-base font-semibold focus:shadow-[4px_4px_0_var(--sa)] focus:outline-none",
  panel: "border-2 border-(--sp) bg-white p-5 shadow-[4px_4px_0_var(--sp)]",
  productGrid: "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6",
  heading: "text-4xl font-black md:text-5xl",
  badge: "border-2 border-(--sp) bg-(--sa) px-2.5 py-0.5 text-sm font-black text-(--sa-fg)",
  imageFrame: "border-2 border-(--sp) bg-(--sp-soft) shadow-[6px_6px_0_var(--sp)]",
};

export const warmCls: Kit["cls"] = {
  page: "bg-[#FFF9F1] text-(--sp)",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-13 items-center justify-center gap-2 rounded-full bg-(--sp) px-8 text-[15px] font-bold text-(--sp-fg) shadow-soft transition-all hover:scale-[1.02] active:scale-95 disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-13 items-center justify-center gap-2 rounded-full border-2 border-(--sp) bg-white px-8 text-[15px] font-bold transition-colors hover:bg-(--sa-soft) disabled:opacity-50",
  chip: "rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-(--sp-line) transition-colors hover:ring-(--sp)",
  chipOn: "bg-(--sp) text-(--sp-fg) ring-(--sp)",
  input: "h-13 w-full rounded-full border border-(--sp-line) bg-white px-5 text-[15px] focus:border-(--sa) focus:outline-none focus:ring-2 focus:ring-(--sa)/40",
  panel: "rounded-[1.75rem] bg-white p-6 shadow-soft ring-1 ring-(--sp-line)",
  productGrid: "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4",
  heading: "text-2xl font-extrabold md:text-4xl",
  badge: "rounded-full bg-(--sa) px-3 py-1 text-xs font-bold text-(--sa-fg)",
  imageFrame: "rounded-[2rem] overflow-hidden bg-white ring-1 ring-(--sp-line)",
};

export const editorialCls: Kit["cls"] = {
  page: "bg-white text-(--sp)",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-13 items-center justify-center gap-2 bg-(--sp) px-9 text-sm font-bold tracking-wider text-(--sp-fg) transition-opacity hover:opacity-85 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-13 items-center justify-center gap-2 border border-(--sp) px-9 text-sm font-bold tracking-wider transition-colors hover:bg-(--sp) hover:text-(--sp-fg) disabled:opacity-50",
  chip: "border border-(--sp) px-4 py-2 text-sm font-medium transition-colors hover:bg-(--sp-soft)",
  chipOn: "bg-(--sp) text-(--sp-fg)",
  input: "h-13 w-full border border-(--sp) bg-white px-4 text-[15px] focus:border-(--sa) focus:outline-none focus:ring-2 focus:ring-(--sa)/40",
  panel: "border border-(--sp) bg-white p-6",
  productGrid: "grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:gap-x-6",
  heading: "text-4xl font-black tracking-tight md:text-5xl",
  badge: "bg-(--sa) px-2.5 py-0.5 text-xs font-black text-(--sa-fg)",
  imageFrame: "bg-(--sp-soft)",
};

export const noirCls: Kit["cls"] = {
  page: "bg-[#FAF8F5] text-(--sp)",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-13 items-center justify-center gap-2 bg-(--sp) px-10 text-sm tracking-[0.2em] text-(--sp-fg) ring-1 ring-(--sa) transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-13 items-center justify-center gap-2 border border-(--sp) px-10 text-sm tracking-[0.2em] transition-colors hover:bg-(--sp) hover:text-(--sp-fg) disabled:opacity-50",
  chip: "border border-(--sp-line) bg-white px-4 py-2 text-sm tracking-wide transition-colors hover:border-(--sa)",
  chipOn: "border-(--sp) bg-(--sp) text-(--sp-fg)",
  input: "h-13 w-full border border-(--sp-line) bg-white px-4 text-[15px] focus:border-(--sa) focus:outline-none focus:ring-2 focus:ring-(--sa)/30",
  panel: "border border-(--sp-line) bg-white p-6 ring-1 ring-transparent",
  productGrid: "grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6",
  heading: "text-3xl font-light tracking-[0.15em] md:text-4xl",
  badge: "bg-(--sa) px-2.5 py-0.5 text-xs font-bold tracking-wider text-(--sa-fg)",
  imageFrame: "rounded-t-[4rem] overflow-hidden bg-white ring-1 ring-(--sp-line)",
};

export const popCls: Kit["cls"] = {
  page: "bg-white text-(--sp)",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-13 items-center justify-center gap-2 rounded-full bg-(--sa) px-8 text-base font-black text-(--sa-fg) shadow-[0_4px_0_var(--sp)] transition-all hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-13 items-center justify-center gap-2 rounded-full border-2 border-(--sp) bg-white px-8 text-base font-black transition-colors hover:bg-(--sa-soft) disabled:opacity-50",
  chip: "rounded-full bg-(--sp-soft) px-4 py-2 text-sm font-bold transition-transform hover:-rotate-2 hover:scale-105",
  chipOn: "bg-(--sp) text-(--sp-fg)",
  input: "h-13 w-full rounded-2xl border-2 border-(--sp-line) bg-white px-4 text-[15px] font-medium focus:border-(--sa) focus:outline-none focus:ring-2 focus:ring-(--sa)/40",
  panel: "rounded-[1.75rem] bg-(--sp-soft) p-5",
  productGrid: "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4",
  heading: "text-3xl font-black md:text-5xl",
  badge: "rounded-full bg-(--sa) px-3 py-1 text-xs font-black text-(--sa-fg)",
  imageFrame: "rounded-[2rem] overflow-hidden bg-(--sp-soft)",
};

export const galleryCls: Kit["cls"] = {
  page: "bg-white text-(--sp)",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-(--sp) px-7 text-[15px] font-semibold text-(--sp-fg) transition-all hover:opacity-90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-(--sp-line) px-7 text-[15px] font-semibold transition-colors hover:border-(--sp) disabled:opacity-50",
  chip: "rounded-full px-4 py-2 text-sm text-(--sp-muted) ring-1 ring-(--sp-line) transition-colors hover:text-(--sp) hover:ring-(--sp)",
  chipOn: "bg-(--sp) text-(--sp-fg) ring-(--sp)",
  input: "h-12 w-full rounded-xl bg-(--sp-soft) px-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-(--sa)",
  panel: "rounded-3xl bg-(--sp-soft) p-6",
  productGrid: "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4",
  heading: "text-3xl font-bold tracking-tight md:text-4xl",
  badge: "rounded-full bg-(--sa) px-2.5 py-1 text-xs font-bold text-(--sa-fg)",
  imageFrame: "rounded-3xl overflow-hidden bg-(--sp-soft)",
};

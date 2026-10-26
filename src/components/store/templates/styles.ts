import type { Kit } from "./types";

// classes القوالب (ملف محايد: يشتغل على السيرفر والعميل، بخلاف ملفات "use client")

export const naqaCls: Kit["cls"] = {
  page: "bg-white text-(--sp)",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-12 items-center justify-center gap-2 rounded-md bg-(--sp) px-8 text-[15px] font-medium text-(--sp-fg) transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-12 items-center justify-center gap-2 rounded-md border border-(--sp-line) px-8 text-[15px] font-medium transition-colors hover:border-(--sp) disabled:opacity-50",
  chip: "rounded-md border border-(--sp-line) px-4 py-2 text-sm transition-colors hover:border-(--sp)",
  chipOn: "border-(--sp) bg-(--sp) text-(--sp-fg)",
  input: "h-12 w-full rounded-md border border-(--sp-line) bg-white px-4 text-[15px] focus:border-(--sp) focus:outline-none",
  panel: "rounded-lg border border-(--sp-line) bg-white p-5",
  productGrid: "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4",
  heading: "text-2xl font-semibold tracking-tight md:text-3xl",
  badge: "rounded bg-(--sa) px-2 py-0.5 text-xs font-semibold text-(--sa-fg)",
  imageFrame: "rounded-xl overflow-hidden bg-(--sp-soft)",
};

export const makhmalCls: Kit["cls"] = {
  page: "bg-[#FBF8F3] text-(--sp) font-light",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-13 items-center justify-center gap-2 bg-(--sp) px-12 text-sm tracking-[0.2em] text-(--sp-fg) transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-13 items-center justify-center gap-2 border border-(--sa) px-12 text-sm tracking-[0.2em] text-(--sa-text) transition-colors hover:bg-(--sa) hover:text-(--sa-fg) disabled:opacity-50",
  chip: "border border-(--sp-line) px-4 py-2 text-sm tracking-wide transition-colors hover:border-(--sa)",
  chipOn: "border-(--sa) bg-(--sa) text-(--sa-fg)",
  input: "h-13 w-full border-0 border-b border-(--sp-line) bg-transparent px-1 text-[15px] focus:border-(--sa) focus:outline-none",
  panel: "border border-(--sa)/30 bg-white p-6",
  productGrid: "grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4 lg:gap-x-8",
  heading: "text-3xl font-extralight tracking-[0.12em] md:text-4xl",
  badge: "bg-(--sa) px-3 py-1 text-xs tracking-wider text-(--sa-fg)",
  imageFrame: "bg-white ring-1 ring-(--sa)/30",
};

export const nabdCls: Kit["cls"] = {
  page: "bg-white text-(--sp) font-semibold",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-13 items-center justify-center gap-2 bg-(--sa) px-9 text-lg font-black text-(--sa-fg) shadow-[4px_4px_0_var(--sp)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_var(--sp)] disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-13 items-center justify-center gap-2 border-2 border-(--sp) bg-white px-9 text-lg font-black transition-colors hover:bg-(--sa-soft) disabled:opacity-50",
  chip: "border-2 border-(--sp) px-4 py-2 text-sm font-black transition-colors hover:bg-(--sa-soft)",
  chipOn: "bg-(--sp) text-(--sp-fg)",
  input: "h-13 w-full border-2 border-(--sp) bg-white px-4 text-base font-semibold focus:shadow-[4px_4px_0_var(--sa)] focus:outline-none",
  panel: "border-2 border-(--sp) bg-white p-5",
  productGrid: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5",
  heading: "text-4xl font-black md:text-5xl",
  badge: "bg-(--sa) px-3 py-1 text-sm font-black text-(--sa-fg)",
  imageFrame: "border-2 border-(--sp) bg-(--sp-soft)",
};

export const souqCls: Kit["cls"] = {
  page: "bg-white text-(--sp)",
  container: "mx-auto w-full max-w-7xl px-4",
  btn: "inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-(--sa) px-7 text-[15px] font-bold text-(--sa-fg) transition-all hover:brightness-95 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-(--sp) px-7 text-[15px] font-bold transition-colors hover:bg-(--sp-soft) disabled:opacity-50",
  chip: "rounded-lg border border-(--sp-line) bg-white px-3.5 py-2 text-sm font-medium transition-colors hover:border-(--sp)",
  chipOn: "border-(--sp) bg-(--sp) text-(--sp-fg)",
  input: "h-12 w-full rounded-lg border border-(--sp-line) bg-white px-4 text-[15px] focus:border-(--sa) focus:outline-none focus:ring-2 focus:ring-(--sa)/30",
  panel: "rounded-lg border border-(--sp-line) bg-white p-4",
  productGrid: "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
  heading: "text-xl font-extrabold md:text-2xl",
  badge: "rounded bg-(--sa) px-2 py-0.5 text-xs font-bold text-(--sa-fg)",
  imageFrame: "rounded-lg border border-(--sp-line) bg-white",
};

export const hikayaCls: Kit["cls"] = {
  page: "bg-[#FCF7EF] text-(--sp)",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-13 items-center justify-center gap-2 rounded-full bg-(--sp) px-9 text-[15px] font-bold text-(--sp-fg) transition-transform hover:scale-[1.02] active:scale-95 disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-13 items-center justify-center gap-2 rounded-full border-2 border-(--sp) px-9 text-[15px] font-bold transition-colors hover:bg-(--sa-soft) disabled:opacity-50",
  chip: "rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-(--sp-line) transition-colors hover:ring-(--sp)",
  chipOn: "bg-(--sp) text-(--sp-fg) ring-(--sp)",
  input: "h-13 w-full rounded-2xl border border-(--sp-line) bg-white px-5 text-[15px] focus:border-(--sa) focus:outline-none focus:ring-2 focus:ring-(--sa)/40",
  panel: "rounded-3xl bg-white p-6 ring-1 ring-(--sp-line)",
  productGrid: "grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4",
  heading: "text-3xl font-extrabold md:text-5xl",
  badge: "rounded-full bg-(--sa) px-3 py-1 text-xs font-bold text-(--sa-fg)",
  imageFrame: "rounded-3xl overflow-hidden bg-(--sa-soft)",
};

export const lamsaCls: Kit["cls"] = {
  page: "bg-white text-(--sp)",
  container: "mx-auto w-full max-w-6xl px-4",
  btn: "inline-flex h-13 items-center justify-center gap-2 rounded-full bg-(--sp) px-9 text-[15px] font-bold text-(--sp-fg) shadow-soft transition-transform hover:scale-[1.02] active:scale-95 disabled:pointer-events-none disabled:opacity-50",
  btnOutline: "inline-flex h-13 items-center justify-center gap-2 rounded-full border-2 border-(--sp) bg-white px-9 text-[15px] font-bold transition-colors hover:bg-(--sa-soft) disabled:opacity-50",
  chip: "rounded-full bg-(--sa-soft) px-4 py-2 text-sm font-bold transition-transform hover:-rotate-2 hover:scale-105",
  chipOn: "bg-(--sp) text-(--sp-fg)",
  input: "h-13 w-full rounded-2xl border-2 border-(--sp-line) bg-white px-4 text-[15px] font-medium focus:border-(--sa) focus:outline-none focus:ring-2 focus:ring-(--sa)/40",
  panel: "rounded-[2rem] bg-(--sa-soft) p-6",
  productGrid: "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4",
  heading: "text-3xl font-extrabold md:text-4xl",
  badge: "rounded-full bg-(--sa) px-3 py-1 text-xs font-bold text-(--sa-fg)",
  imageFrame: "rounded-[2rem] overflow-hidden bg-(--sa-soft)",
};

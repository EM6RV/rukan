import type { BusinessType, StoreTemplate } from "./constants";

export type Palette = { name: string; primary: string; accent: string };

// نوع النشاط يقترح قالب وألوان مناسبة (البياع يقدر يغيرهم)
export const BUSINESS_PRESETS: Record<BusinessType, { template: StoreTemplate; palette: Palette }> = {
  perfume: { template: "noir", palette: { name: "عنبر", primary: "#2B1B3D", accent: "#C19E58" } },
  beauty: { template: "elegant", palette: { name: "وردي", primary: "#7A2E4A", accent: "#E3B7A0" } },
  clothing: { template: "editorial", palette: { name: "جريء", primary: "#111111", accent: "#E4572E" } },
  accessories: { template: "gallery", palette: { name: "ملكي", primary: "#0D263E", accent: "#C19E58" } },
  food: { template: "warm", palette: { name: "دافي", primary: "#7A3E12", accent: "#E0A030" } },
  other: { template: "simple", palette: { name: "رُكن", primary: "#0D263E", accent: "#C19E58" } },
};

export const PALETTES: Palette[] = [
  { name: "رُكن", primary: "#0D263E", accent: "#C19E58" },
  { name: "عنبر", primary: "#2B1B3D", accent: "#C19E58" },
  { name: "زمردي", primary: "#12372A", accent: "#D9B65C" },
  { name: "تركوازي", primary: "#08545C", accent: "#F0B84A" },
  { name: "وردي", primary: "#7A2E4A", accent: "#E3B7A0" },
  { name: "جريء", primary: "#111111", accent: "#E4572E" },
  { name: "دافي", primary: "#7A3E12", accent: "#E0A030" },
  { name: "ليلي", primary: "#1B1F3B", accent: "#7C83FD" },
];

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

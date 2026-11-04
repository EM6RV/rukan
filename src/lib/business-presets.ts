import type { BusinessType, StoreTemplate } from "./constants";

export type Palette = { name: string; primary: string; accent: string };

// نوع النشاط يقترح قالب وألوان مناسبة (البياع يقدر يغيرهم)
export const BUSINESS_PRESETS: Record<BusinessType, { template: StoreTemplate; palette: Palette }> = {
  perfume: { template: "makhmal", palette: { name: "عنبر", primary: "#2B1B3D", accent: "#C19E58" } },
  beauty: { template: "makhmal", palette: { name: "وردي", primary: "#7A2E4A", accent: "#E3B7A0" } },
  clothing: { template: "nabd", palette: { name: "جريء", primary: "#111111", accent: "#E4572E" } },
  accessories: { template: "lamsa", palette: { name: "ملكي", primary: "#0D263E", accent: "#C19E58" } },
  food: { template: "hikaya", palette: { name: "دافي", primary: "#7A3E12", accent: "#E0A030" } },
  other: { template: "naqa", palette: { name: "رُكن", primary: "#0D263E", accent: "#C19E58" } },
  grocery: { template: "souq", palette: { name: "زمردي", primary: "#12372A", accent: "#D9B65C" } },
  lounge: { template: "nabd", palette: { name: "ليلي", primary: "#1B1F3B", accent: "#7C83FD" } },
  gym: { template: "nabd", palette: { name: "جريء", primary: "#111111", accent: "#E4572E" } },
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

// شركات التوصيل الليبية. الربط الآلي (API) ما يتعملش إلا بعد اتفاق ومفاتيح رسمية — وقتها نضيف adapter لكل شركة.
// حالياً الكل «يدوي»: البياع يختار الشركة ويكتب رقم الشحنة، ولو حط قالب رابط التتبع يطلع الرابط للزبون.
export const SHIPPING_COMPANIES = [
  { id: "vanex", nameAr: "فانكس (Vanex)" },
  { id: "darb", nameAr: "درب السبيل" },
  { id: "nawras", nameAr: "النورس" },
  { id: "other", nameAr: "شركة أخرى" },
] as const;
export type ShippingCompanyId = (typeof SHIPPING_COMPANIES)[number]["id"];
export const SHIPPING_COMPANY_IDS = SHIPPING_COMPANIES.map((c) => c.id) as [ShippingCompanyId, ...ShippingCompanyId[]];
export const shippingCompanyName = (id: string | null | undefined) => SHIPPING_COMPANIES.find((c) => c.id === id)?.nameAr ?? null;

/** يبني رابط التتبع من القالب اللي حدده البياع ({n} = رقم الشحنة). https فقط. */
export function trackingUrl(template: string | null | undefined, shipmentNumber: string | null | undefined): string | null {
  if (!template || !shipmentNumber) return null;
  if (!/^https:\/\//i.test(template) || !template.includes("{n}")) return null;
  try { return new URL(template.replace("{n}", encodeURIComponent(shipmentNumber.trim()))).toString(); } catch { return null; }
}

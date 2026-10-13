// Meta Pixel و TikTok Pixel لكل متجر. الـ ID لازم يكون أرقام/حروف فقط (يتحقق منه قبل ما ينحط في سكربت).
export const PIXEL_ID_RE = /^[A-Za-z0-9]{5,25}$/;
export const validPixelId = (id: string | null | undefined): string | null => (id && PIXEL_ID_RE.test(id) ? id : null);

export type PixelEvent =
  | { name: "ViewContent"; value: number; id: string; contentName: string }
  | { name: "AddToCart"; value: number; id: string; contentName: string; quantity: number }
  | { name: "InitiateCheckout"; value: number; count: number }
  | { name: "Purchase"; value: number; orderNumber: number; count: number };

type Win = Window & { fbq?: (...a: unknown[]) => void; ttq?: { track: (...a: unknown[]) => void } };

/** يرسل الحدث للبكسلات الموجودة في الصفحة (لو ما فيه بكسل ما يسوي شي) */
export function trackPixel(e: PixelEvent) {
  if (typeof window === "undefined") return;
  const w = window as Win;
  const currency = "LYD";
  const value = e.value / 1000; // من درهم لدينار
  try {
    if (e.name === "ViewContent") {
      w.fbq?.("track", "ViewContent", { content_ids: [e.id], content_name: e.contentName, content_type: "product", value, currency });
      w.ttq?.track("ViewContent", { content_id: e.id, content_name: e.contentName, value, currency });
    } else if (e.name === "AddToCart") {
      w.fbq?.("track", "AddToCart", { content_ids: [e.id], content_name: e.contentName, content_type: "product", value, currency });
      w.ttq?.track("AddToCart", { content_id: e.id, content_name: e.contentName, quantity: e.quantity, value, currency });
    } else if (e.name === "InitiateCheckout") {
      w.fbq?.("track", "InitiateCheckout", { num_items: e.count, value, currency });
      w.ttq?.track("InitiateCheckout", { quantity: e.count, value, currency });
    } else {
      w.fbq?.("track", "Purchase", { num_items: e.count, value, currency }, { eventID: `order-${e.orderNumber}` });
      w.ttq?.track("CompletePayment", { quantity: e.count, value, currency });
    }
  } catch {}
}

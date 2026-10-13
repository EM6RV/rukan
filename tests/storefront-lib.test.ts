import { describe, expect, it } from "vitest";
import { validPixelId } from "@/lib/pixels";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import { contrastRatio, readableOn } from "@/lib/contrast";
import { storeThemeVars } from "@/lib/store-theme";
import { excerpt, safeJsonLd } from "@/lib/text";
import { orderConfirmMessage, waLink } from "@/lib/whatsapp";
import { parseWidth } from "@/server/media-resize";
import { resolveHost } from "@/lib/host";

describe("البكسل", () => {
  it("يقبل IDs سليمة بس (ما ينحقنش كود)", () => {
    expect(validPixelId("1234567890")).toBe("1234567890");
    expect(validPixelId("CABC123DEF456")).toBe("CABC123DEF456");
    for (const bad of ["", null, undefined, "12", "abc'); alert(1);//", "1 2 3 4 5", "<script>", "x".repeat(26)]) expect(validPixelId(bad as string | null)).toBeNull();
  });
});

describe("الصور", () => {
  it("روابط وعروض مسموحة فقط", () => {
    expect(mediaUrl("abc")).toBe("/api/media/abc");
    expect(mediaUrl("abc", 320)).toBe("/api/media/abc?w=320");
    expect(mediaSrcSet("abc", [320, 640])).toBe("/api/media/abc?w=320 320w, /api/media/abc?w=640 640w");
    expect(parseWidth("320")).toBe(320);
    for (const bad of [null, "", "100", "99999", "abc", "320.5", "-320"]) expect(parseWidth(bad)).toBeNull();
  });
});

describe("ثيم المتجر", () => {
  it("النص فوق الألوان مقروء دايماً", () => {
    const dark = storeThemeVars("#0D263E", "#C19E58");
    expect(dark["--sp-fg"]).toBe("#FFFFFF");
    expect(dark["--sa-fg"]).toBe("#0D263E"); // فوق الذهبي نص كحلي
    const light = storeThemeVars("#F5F5F5", "#FFEE88");
    expect(light["--sp-fg"]).toBe("#0D263E");
    expect(light["--sa-text"]).not.toBe("#FFEE88"); // لون خفيف: نص التمييز يتغمّق علشان يقرا على الأبيض
  });
});

describe("لون النص فوق ألوان البياع", () => {
  it.each(["#E4572E", "#FF6B35", "#C19E58", "#0D263E", "#F5F5F5", "#087C86", "#FFEE88", "#22AA55"])("يوصل 4.5:1 على الأقل فوق %s", (bg) => {
    expect(contrastRatio(readableOn(bg), bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("تباين النص الثانوي", () => {
  it.each(["#0D263E", "#2B1B3D", "#111111", "#087C86", "#E8572A"])("--sp-muted على الكريمي ≥ 4.5 مع %s", (primary) => {
    const muted = storeThemeVars(primary, "#C19E58")["--sp-muted"]!;
    expect(contrastRatio(muted, "#FBF8F3")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("نصوص", () => {
  it("excerpt وJSON-LD آمن", () => {
    expect(excerpt("  سطر\n\nثاني  ")).toBe("سطر ثاني");
    expect(excerpt("x".repeat(300), 20)).toHaveLength(20);
    expect(excerpt(null)).toBeUndefined();
    expect(safeJsonLd({ a: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });

  it("رسالة تأكيد واتساب", () => {
    const text = orderConfirmMessage({ storeName: "عطور الندى", number: 1001, name: "سالم", total: 333_000, items: [{ name: "عود", variantLabel: "100 مل", quantity: 2 }] });
    expect(text).toContain("رقم 1001");
    expect(text).toContain("عود (100 مل) × 2");
    expect(text).toContain("333 د.ل");
    expect(waLink("218912345678", "مرحبا بك")).toBe("https://wa.me/218912345678?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%20%D8%A8%D9%83");
  });
});

describe("توجيه الدومينات", () => {
  it("مفتاح المتجر لأي نوع وصول", () => {
    expect(resolveHost("nada-perfume.localhost:3100", "localhost:3000")).toEqual({ type: "store", key: "nada-perfume", kind: "subdomain" });
  });
});

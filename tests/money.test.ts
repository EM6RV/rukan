import { describe, expect, it } from "vitest";
import { dinarToDirham, formatMoney } from "@/lib/money";

describe("الفلوس", () => {
  it("يحوّل من دينار لدرهم بدون أخطاء float", () => {
    expect(dinarToDirham(12.5)).toBe(12_500);
    expect(dinarToDirham(0.1 + 0.2)).toBe(300);
  });
  it("يعرض بالدينار", () => {
    expect(formatMoney(49_000)).toBe("49 د.ل");
    expect(formatMoney(12_500)).toBe("12.5 د.ل");
  });
});

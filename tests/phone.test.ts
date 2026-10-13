import { describe, expect, it } from "vitest";
import { normalizeLibyanPhone, toWhatsappNumber } from "@/lib/phone";

describe("أرقام ليبيا", () => {
  it.each([
    ["0912345678", "0912345678"],
    ["091 234 5678", "0912345678"],
    ["091-234-5678", "0912345678"],
    ["+218912345678", "0912345678"],
    ["00218 91 2345678", "0912345678"],
    ["218912345678", "0912345678"],
    ["912345678", "0912345678"],
    ["٠٩٢١٢٣٤٥٦٧", "0921234567"],
    ["0941234567", "0941234567"],
    ["0951234567", "0951234567"],
  ])("يقبل %s", (input, expected) => expect(normalizeLibyanPhone(input)).toBe(expected));

  it.each(["0961234567", "090123456", "09123456789", "0212345678", "abc", "", "+20912345678", "+218812345678"])(
    "يرفض %s",
    (input) => expect(normalizeLibyanPhone(input)).toBeNull(),
  );

  it("صيغة واتساب الدولية", () => {
    expect(toWhatsappNumber("0912345678")).toBe("218912345678");
    expect(toWhatsappNumber("xx")).toBeNull();
  });
});

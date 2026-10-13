import { describe, expect, it } from "vitest";
import { combinations, syncVariants, variantKey } from "@/lib/variants";
import { dirhamToInput, inputToDirham } from "@/lib/money";

const opt = (id: string, ...vals: string[]) => ({ id, values: vals.map((v) => ({ id: v })) });

describe("المتغيرات", () => {
  it("التركيبات", () => {
    expect(combinations([])).toEqual([[]]);
    expect(combinations([opt("o1", "a", "b")])).toEqual([["a"], ["b"]]);
    expect(combinations([opt("o1", "a", "b"), opt("o2", "x", "y", "z")])).toHaveLength(6);
    expect(combinations([opt("o1", "a"), opt("o2", "x")])).toEqual([["a", "x"]]);
  });

  it("المزامنة تحافظ على الموجود وتضيف الجديد وتشيل المحذوف", () => {
    type V = { valueIds: string[]; stock: number };
    const make = (valueIds: string[]): V => ({ valueIds, stock: 0 });
    const first = syncVariants([opt("o1", "a", "b")], [], make);
    const withStock = first.map((v) => ({ ...v, stock: v.valueIds[0] === "a" ? 7 : 3 }));
    // نضيف قيمة c
    const added = syncVariants([opt("o1", "a", "b", "c")], withStock, make);
    expect(added.map((v) => v.stock)).toEqual([7, 3, 0]);
    // نشيل a
    const removed = syncVariants([opt("o1", "b", "c")], added, make);
    expect(removed.map((v) => [v.valueIds[0], v.stock])).toEqual([["b", 3], ["c", 0]]);
  });

  it("المفتاح ما يتأثرش بالترتيب", () => {
    expect(variantKey(["b", "a"])).toBe(variantKey(["a", "b"]));
  });
});

describe("تحويل المبالغ", () => {
  it("من الحقل للدرهم", () => {
    expect(inputToDirham("12.5")).toBe(12_500);
    expect(inputToDirham("١٢٫٥")).toBe(12_500);
    expect(inputToDirham("12,5")).toBe(12_500);
    expect(inputToDirham("")).toBeNull();
    expect(inputToDirham("abc")).toBeUndefined();
    expect(inputToDirham("0.1")).toBe(100);
  });
  it("من الدرهم للحقل", () => {
    expect(dirhamToInput(12_500)).toBe("12.5");
    expect(dirhamToInput(49_000)).toBe("49");
    expect(dirhamToInput(null)).toBe("");
  });
});

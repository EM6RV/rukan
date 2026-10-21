import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { phoneVerifications, users } from "@/db/schema/platform";
import { checkVerificationCode, isPhoneVerified, sendVerificationCode, senderFor, smsSender, verificationRequired, type CodeSender } from "@/server/auth/phone-verification";
import { makeTestDb } from "./helpers/db";

let db: Db, close: () => void;
beforeAll(async () => { ({ db, close } = await makeTestDb()); });
afterAll(() => close());

const capture = () => { const sent: { phone: string; code: string }[] = []; const s: CodeSender = { channel: "sms", async send(phone, code) { sent.push({ phone, code }); } }; return { s, sent }; };

describe("التحقق من الهاتف بكود", () => {
  it("مطفي افتراضياً: التسجيل يمشي بدون كود (الخطوة تتخطى)", async () => {
    expect(verificationRequired(undefined)).toBe(false);
    expect(verificationRequired("off")).toBe(false);
    expect(senderFor("off")).toBeNull();
    expect(await sendVerificationCode(db, "0912345678", null)).toEqual({ ok: true, data: { sent: false } });
    expect((await db.select().from(phoneVerifications)).length).toBe(0);
  });

  it("المحوّلات الجاهزة فاضية: تفشل بوضوح بدل ما تتظاهر إنها بعثت", async () => {
    expect(verificationRequired("sms")).toBe(true);
    await expect(smsSender.send("0912345678", "123456")).rejects.toThrow("SMS");
    const r = await sendVerificationCode(db, "0912340000", smsSender);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("ما قدرنا") });
  });

  it("إرسال وتحقق: الكود مخزن مشفر ويستعمل مرة وحدة", async () => {
    const { s, sent } = capture();
    expect((await sendVerificationCode(db, "+218 91 111 2222", s)).ok).toBe(true);
    expect(sent[0]!.phone).toBe("0911112222");
    const row = (await db.select().from(phoneVerifications).where(eq(phoneVerifications.phone, "0911112222")))[0]!;
    expect(row.codeHash).not.toContain(sent[0]!.code);
    await db.insert(users).values({ phone: "0911112222", name: "س", passwordHash: "x" });
    expect(await checkVerificationCode(db, "0911112222", "000000")).toEqual({ ok: false, error: expect.stringContaining("غلط") });
    expect((await checkVerificationCode(db, "0911112222", sent[0]!.code)).ok).toBe(true);
    expect(await isPhoneVerified(db, "0911112222")).toBe(true);
    expect((await db.select().from(users).where(eq(users.phone, "0911112222")))[0]!.phoneVerifiedAt).not.toBeNull();
    expect((await checkVerificationCode(db, "0911112222", sent[0]!.code)).ok).toBe(false); // مستعمل
  });

  it("5 محاولات غلط تقفل الكود، والكود المنتهي مرفوض، والرقم غير الليبي مرفوض", async () => {
    const { s, sent } = capture();
    await sendVerificationCode(db, "0913333444", s);
    const bad = sent[0]!.code === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i++) await checkVerificationCode(db, "0913333444", bad);
    expect(await checkVerificationCode(db, "0913333444", sent[0]!.code)).toEqual({ ok: false, error: expect.stringContaining("محاولات") });
    const { s: s2, sent: sent2 } = capture();
    await sendVerificationCode(db, "0914444555", s2, Date.now() - 11 * 60_000);
    expect((await checkVerificationCode(db, "0914444555", sent2[0]!.code)).ok).toBe(false);
    expect((await sendVerificationCode(db, "0961234567", s)).ok).toBe(false);
    expect((await checkVerificationCode(db, "0914444555", "12")).ok).toBe(false);
  });

  it("حد 3 أكواد في الساعة لكل رقم", async () => {
    const { s } = capture();
    const rs = [];
    for (let i = 0; i < 4; i++) rs.push((await sendVerificationCode(db, "0915555666", s)).ok);
    expect(rs).toEqual([true, true, true, false]);
  });
});

import { describe, expect, it } from "vitest";
import { resolveHost } from "@/lib/host";

const ROOT = "rukn.ly";
const store = (key: string, kind: "subdomain" | "custom-domain" = "subdomain") => ({ type: "store", key, kind });

describe("تحديد المتجر من الـ Host", () => {
  it("الدومين الرئيسي والمنصة", () => {
    for (const h of ["rukn.ly", "RUKN.LY", "www.rukn.ly", "rukn.ly:443", "localhost:3000", "127.0.0.1:3000", "rukn.onrender.com", null, ""]) {
      expect(resolveHost(h, ROOT), String(h)).toEqual({ type: "platform" });
    }
  });

  it("subdomain متجر", () => {
    expect(resolveHost("sara-perfume.rukn.ly", ROOT)).toEqual(store("sara-perfume"));
    expect(resolveHost("Sara.RUKN.ly:443", ROOT)).toEqual(store("sara"));
  });

  it("subdomains محجوزة ومتعددة المستويات تروح للمنصة", () => {
    expect(resolveHost("admin.rukn.ly", ROOT)).toEqual({ type: "platform" });
    expect(resolveHost("api.rukn.ly", ROOT)).toEqual({ type: "platform" });
    expect(resolveHost("a.b.rukn.ly", ROOT)).toEqual({ type: "platform" });
  });

  it("دومين خاص", () => {
    expect(resolveHost("shop.example.com", ROOT)).toEqual(store("shop.example.com", "custom-domain"));
    expect(resolveHost("example.ly.", ROOT)).toEqual(store("example.ly", "custom-domain"));
  });

  it("دومين شبيه بالرئيسي ما ينخدعش (rukn.ly.evil.com / evilrukn.ly)", () => {
    expect(resolveHost("rukn.ly.evil.com", ROOT)).toEqual(store("rukn.ly.evil.com", "custom-domain"));
    expect(resolveHost("evilrukn.ly", ROOT)).toEqual(store("evilrukn.ly", "custom-domain"));
  });

  it("التطوير المحلي: slug.localhost مع ROOT_DOMAIN=localhost:3000", () => {
    expect(resolveHost("demo.localhost:3000", "localhost:3000")).toEqual(store("demo"));
    expect(resolveHost("localhost:3000", "localhost:3000")).toEqual({ type: "platform" });
  });
});

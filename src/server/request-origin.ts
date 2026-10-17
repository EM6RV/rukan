import "server-only";
import { headers } from "next/headers";
import type { StoreUrlRequest } from "@/lib/store-url";

/** الدومين اللي فتح منه المستخدم الصفحة الحالية (للروابط اللي تتبني على نفس الأصل) */
export async function currentRequest(): Promise<StoreUrlRequest> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
  return { host, proto };
}

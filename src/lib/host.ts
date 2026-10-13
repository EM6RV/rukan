import { RESERVED_SLUGS } from "./validation";

export type HostTarget =
  | { type: "platform" }
  | { type: "store"; key: string; kind: "subdomain" | "custom-domain" };

const stripPort = (h: string) => h.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
const isIp = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");

/**
 * يحدد وين يروح الطلب حسب الـ Host:
 *  - rukn.ly / www.rukn.ly / localhost / IP / *.onrender.com   → المنصة (موقع + لوحات)
 *  - slug.rukn.ly (مستوى واحد، مش محجوز)                        → متجر بالـ slug
 *  - أي دومين ثاني                                              → دومين خاص بمتجر
 */
export function resolveHost(hostHeader: string | null | undefined, rootDomain: string): HostTarget {
  const host = stripPort(hostHeader ?? "");
  const root = stripPort(rootDomain);
  if (!host || host === root || host === `www.${root}` || host === "localhost" || isIp(host) || host.endsWith(".onrender.com")) {
    return { type: "platform" };
  }
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub.includes(".") || RESERVED_SLUGS.has(sub)) return { type: "platform" };
    return { type: "store", key: sub, kind: "subdomain" };
  }
  // slug.localhost للتطوير المحلي لما ROOT_DOMAIN مش localhost
  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    return sub && !sub.includes(".") && !RESERVED_SLUGS.has(sub) ? { type: "store", key: sub, kind: "subdomain" } : { type: "platform" };
  }
  return { type: "store", key: host, kind: "custom-domain" };
}

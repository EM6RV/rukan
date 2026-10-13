import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/csp";


const nextConfig: NextConfig = {
  poweredByHeader: false,
  // استيراد المنتجات يرفع ملفات CSV/Excel (الحد 2MB في الكود)
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  serverExternalPackages: ["@node-rs/argon2", "@libsql/client", "libsql", "sharp"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV === "production") }];
  },
};

export default nextConfig;

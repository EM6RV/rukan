import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // صورنا أصلاً WebP مضغوطة من /api/media، فما نحتاجش next/image
    rules: { "@next/next/no-img-element": "off" },
  },
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "src/db/migrations/**"]),
  {
    // عزل المتاجر: جداول المتجر (T) ما تتستورد إلا من طبقة src/server/tenant
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/tenant/**", "src/db/**", "tests/**", "scripts/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/db/schema",
              message: "استورد من @/db/schema/platform لجداول المنصة، وجداول المتجر عبر forStore(storeId) من @/server/tenant.",
            },
          ],
          patterns: [
            {
              group: ["@/db/schema/tenant"],
              message: "جداول المتجر ما تتستورد مباشرة. استعمل forStore(storeId) من @/server/tenant.",
            },
          ],
        },
      ],
    },
  },
]);

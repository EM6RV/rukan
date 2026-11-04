// أدوات مشتركة لاختبارات المتصفح (تشتغل على خادم شغّال ببيانات seed:demo)
import { chromium } from "playwright-core";
import { createClient } from "@libsql/client";

export const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
export const DB_URL = process.env.DATABASE_URL ?? "file:./data/e2e.db";
export const PASSWORD = "demo-password-123";
export const OWNER_PHONE = "0910000011"; // نادى — عطور الندى (seed:demo)

export const launch = () =>
  chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

export const db = () => createClient({ url: DB_URL });

/** يمسح عدّاد الـ rate limit علشان تسجيلات الدخول المتكررة ما تنحجبش */
export async function resetRateLimits() {
  const c = db();
  await c.execute("delete from rate_limits");
  c.close();
}

export async function login(page, phone = OWNER_PHONE) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="phone"]', phone);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export const results = [];
export const check = (name, ok, extra = "") => {
  results.push(!!ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};
export const finish = async (browser) => {
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} فحص فشل` : "\nكل الفحوص نجحت");
  process.exit(failed ? 1 : 0);
};

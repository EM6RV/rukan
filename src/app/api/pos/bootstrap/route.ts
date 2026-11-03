import { cookies } from "next/headers";
import { getDb } from "@/db";
import { posBootstrap } from "@/server/pos/bootstrap";
import { DEVICE_COOKIE } from "@/server/pos/branches";
import { deviceContext } from "@/server/pos/device-auth";

export const dynamic = "force-dynamic";

/** بيانات بداية جهاز التشغيل (الجهاز يتعرف بكوكي التوكن: صلاحية محدودة بفرعه بس) */
export async function GET() {
  const dc = await deviceContext(getDb(), (await cookies()).get(DEVICE_COOKIE)?.value);
  if (!dc) return Response.json({ error: "الجهاز مش مفعّل. فعّله من لوحة التحكم ← الفروع والأجهزة." }, { status: 401 });
  return Response.json(await posBootstrap(dc), { headers: { "Cache-Control": "no-store" } });
}

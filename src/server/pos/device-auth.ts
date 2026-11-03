import "server-only";
import type { Db } from "@/db";
import { loadDeviceContext } from "./sync";

/** هوية جهاز التشغيل من كوكي التوكن (للمسارات العامة للجهاز: البداية والمزامنة) */
export const deviceContext = (db: Db, token: string | null | undefined) => loadDeviceContext(db, token);

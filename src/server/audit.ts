import { writeTransaction, type Db } from "@/db";
import { auditLogs } from "@/db/schema/platform";

/** سجل نشاط للعمليات الحساسة. الفشل في الكتابة ما يوقفش العملية الأصلية. */
export async function writeAudit(db: Db, e: { actorUserId: string | null; storeId: string | null; action: string; entityType?: string; entityId?: string; meta?: Record<string, unknown> }) {
  try {
    // عبر طابور الكتابة: على قاعدة ملف محلية الكتابة العادية المتزامنة مع معاملة جارية تفشل بـ BUSY
    await writeTransaction(db, async (tx) => {
      await (tx as unknown as Db).insert(auditLogs).values({ actorUserId: e.actorUserId, storeId: e.storeId, action: e.action, entityType: e.entityType ?? null, entityId: e.entityId ?? null, meta: e.meta ?? null });
    });
  } catch (err) {
    console.error("audit log failed", err);
  }
}

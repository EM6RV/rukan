import type { Metadata } from "next";
import { getDb } from "@/db";
import { Card, CardBody } from "@/components/ui/card";
import { canUse } from "@/lib/entitlements";
import { listRoles } from "@/server/roles";
import { listStaff, staffQuota } from "@/server/staff-service";
import { requireStoreContext } from "@/server/store-context";
import { RolesManager } from "./roles-manager";
import { StaffManager } from "./staff-manager";

export const metadata: Metadata = { title: "الموظفين" };

export default async function StaffPage() {
  const ctx = await requireStoreContext("staff");
  const [members, roles] = await Promise.all([listStaff(getDb(), ctx.store.id), listRoles(getDb(), ctx.scope)]);
  const staffCount = members.filter((m) => m.role !== "owner").length;
  const quota = staffQuota(ctx.limits, staffCount);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الموظفين</h1><p className="text-muted">أضف مدير أو موظف طلبيات أو مندوب بحساب خاص، وكل واحد يشوف بس اللي يخصه.</p></div>
      <Card><CardBody className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>موظفينك: <b>{staffCount}</b>{quota.max === null ? " (بدون حد في باقتك)" : ` من ${quota.max}`}</span><span className="text-muted">الموظف يدخل من نفس صفحة تسجيل الدخول برقمه وكلمة السر اللي تعطيه.</span></CardBody></Card>
      <StaffManager members={members.map((m) => ({ id: m.id, name: m.name, phone: m.phone, role: m.role, customRoleId: m.customRoleId, createdAt: m.createdAt }))} canAdd={quota.canAdd && ctx.access.writable} writable={ctx.access.writable} roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
      <RolesManager roles={roles} unlocked={canUse(ctx.limits, "customRoles")} writable={ctx.access.writable} />
    </div>
  );
}

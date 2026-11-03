import type { Metadata } from "next";
import { getDb } from "@/db";
import { Card, CardBody } from "@/components/ui/card";
import { canUse } from "@/lib/entitlements";
import { listRoles } from "@/server/roles";
import { listStaff, staffQuota } from "@/server/staff-service";
import { requireStoreContext } from "@/server/store-context";
import { RolesManager } from "./roles-manager";
import { OPS_LINES } from "@/lib/product-lines";
import { listBranches } from "@/server/pos/branches";
import { StaffManager } from "./staff-manager";

export const metadata: Metadata = { title: "الموظفين" };

export default async function StaffPage() {
  const ctx = await requireStoreContext("staff");
  const ops = OPS_LINES.some((l) => ctx.lines[l].subscribed);
  const [members, roles, branches] = await Promise.all([listStaff(getDb(), ctx.store.id), listRoles(getDb(), ctx.scope), ops ? listBranches(ctx.scope) : Promise.resolve([])]);
  const staffCount = members.filter((m) => m.role !== "owner").length;
  const quota = staffQuota(ctx.limits, staffCount);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الموظفين</h1><p className="text-muted">أضف مدير أو موظف طلبيات أو مندوب أو كاشير بحساب خاص، وكل واحد يشوف بس اللي يخصه. الكاشير يدخل على الجهاز بـ PIN من 4 أرقام.</p></div>
      <Card><CardBody className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>موظفينك: <b>{staffCount}</b>{quota.max === null ? " (بدون حد في باقتك)" : ` من ${quota.max}`}</span><span className="text-muted">الموظف يدخل من نفس صفحة تسجيل الدخول برقمه وكلمة السر اللي تعطيه.</span></CardBody></Card>
      <StaffManager pos={ops ? { branches: branches.map((b) => ({ id: b.id, name: b.name })) } : null}
        members={members.map((m) => ({ id: m.id, name: m.name, phone: m.phone, role: m.role, customRoleId: m.customRoleId, createdAt: m.createdAt, hasPin: m.hasPin, branchIds: m.branchIds }))} canAdd={quota.canAdd && ctx.access.writable} writable={ctx.access.writable} roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
      <RolesManager roles={roles} unlocked={canUse(ctx.limits, "customRoles")} writable={ctx.access.writable} />
    </div>
  );
}

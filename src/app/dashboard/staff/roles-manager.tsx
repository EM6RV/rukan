"use client";

import { useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { LockedButton } from "@/components/ui/locked";
import { Modal } from "@/components/ui/modal";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { FEATURE_INFO } from "@/lib/entitlements";
import { ASSIGNABLE_PERMISSIONS, PERMISSION_LABELS, type Permission } from "@/server/permissions";
import { deleteRoleAction, saveRoleAction } from "./actions";

type Role = { id: string; name: string; permissions: Permission[]; memberCount: number };

function RoleForm({ initial, onClose }: { initial?: Role; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [perms, setPerms] = useState<Permission[]>(initial?.permissions ?? ["orders"]);
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title={initial ? "تعديل الدور" : "دور جديد"} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>إلغاء</Button><Button loading={pending} onClick={() => act(() => saveRoleAction({ id: initial?.id, name, permissions: perms }), "تم الحفظ", onClose)}>حفظ</Button></>}>
      <div className="space-y-4">
        <Input label="اسم الدور" value={name} maxLength={40} placeholder="مثال: محاسب، مسؤول مخزن" onChange={(e) => setName(e.target.value)} />
        <fieldset className="space-y-2"><legend className="text-sm font-medium">الصلاحيات</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ASSIGNABLE_PERMISSIONS.map((p) => (
              <label key={p} className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                <input type="checkbox" className="size-4" checked={perms.includes(p)} onChange={() => setPerms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))} />
                {PERMISSION_LABELS[p]}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className={errorClass}>{error}</p>}
      </div>
    </Modal>
  );
}

export function RolesManager({ roles, unlocked, writable }: { roles: Role[]; unlocked: boolean; writable: boolean }) {
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const del = useAct();
  return (
    <Card>
      <CardHeader title="أدوار مخصصة" description="اصنع دور بصلاحيات محددة (مثلاً: محاسب يشوف التقارير بس)، وعيّنه لأي موظف." />
      <CardBody className="space-y-4">
        {unlocked ? (
          <div className="flex justify-end"><Button size="sm" disabled={!writable} onClick={() => setEditing("new")}><Plus className="size-4" /> دور جديد</Button></div>
        ) : (
          <LockedButton info={{ title: FEATURE_INFO.customRoles.title, benefit: FEATURE_INFO.customRoles.benefit }} className="rounded-md border border-line px-3 py-2 text-sm">الأدوار المخصصة (مقفولة)</LockedButton>
        )}
        {del.error && <p role="alert" className={errorClass}>{del.error}</p>}
        {roles.length === 0 ? <p className="text-sm text-muted">ما فيه أدوار مخصصة.</p> : (
          <ul className="space-y-2">
            {roles.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                <ShieldCheck className="size-5 text-muted" aria-hidden />
                <span className="font-semibold">{r.name}</span><Badge>{r.memberCount} موظف</Badge>
                <span className="w-full text-xs text-muted sm:w-auto sm:flex-1">{r.permissions.map((p) => PERMISSION_LABELS[p]).join("، ")}</span>
                {unlocked && writable && <><Button size="sm" variant="outline" onClick={() => setEditing(r)}>تعديل</Button><Button size="sm" variant="ghost" aria-label={`حذف ${r.name}`} disabled={del.pending} onClick={() => del.act(() => deleteRoleAction(r.id), "تم حذف الدور")}><Trash2 className="size-4 text-danger-fg" /></Button></>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      {editing && <RoleForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

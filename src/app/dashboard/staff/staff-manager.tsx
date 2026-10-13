"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, KeyRound, Plus, Trash2, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm";
import { Input, PasswordInput, PhoneInput, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { MemberRole } from "@/lib/constants";
import { formatDate } from "@/lib/datetime";
import { STAFF_ROLES, STAFF_ROLE_HINTS, STAFF_ROLE_LABELS, type StaffRole } from "@/lib/staff-roles";
import { addStaffAction, changeRoleAction, removeStaffAction, resetPasswordAction } from "./actions";

type Member = { id: string; name: string; phone: string; role: MemberRole; createdAt: number };
type Res = { ok: boolean; error?: string };

function useAct() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<Res>, success: string, onDone?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "صار خطأ");
      toast(success);
      onDone?.();
      router.refresh();
    });
  };
  return { act, pending, error, setError };
}
const ErrorLine = ({ error }: { error: string | null }) => (error ? <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p> : null);

function AddForm({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState({ name: "", phone: "", password: "", role: "orders_staff" as StaffRole });
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title="موظف جديد" footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>رجوع</Button><Button loading={pending} onClick={() => act(() => addStaffAction(v), "تمت إضافة الموظف", onClose)}>إضافة</Button></>}>
      <div className="space-y-4">
        <Input label="الاسم" value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <PhoneInput hint="يدخل بهذا الرقم. لازم يكون غير مسجّل في رُكن" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <PasswordInput label="كلمة السر" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} hint="8 حروف على الأقل. سلّمها للموظف وهو يقدر يغيرها بعدين." />
        <Select label="الصلاحية" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as StaffRole })} hint={STAFF_ROLE_HINTS[v.role]}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>)}</Select>
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}

function ResetForm({ member, onClose }: { member: Member; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const { act, pending, error } = useAct();
  return (
    <Modal open onClose={onClose} title={`كلمة سر جديدة لـ ${member.name}`} footer={<><Button variant="ghost" onClick={onClose} disabled={pending}>رجوع</Button><Button loading={pending} onClick={() => act(() => resetPasswordAction(member.id, pw), "تم تغيير كلمة السر", onClose)}>حفظ</Button></>}>
      <div className="space-y-4">
        <PasswordInput label="كلمة السر الجديدة" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="الموظف يتسجل خروجه من كل الأجهزة." />
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}

export function StaffManager({ members, canAdd, writable }: { members: Member[]; canAdd: boolean; writable: boolean }) {
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const role = useAct();
  const del = useAct();
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button disabled={!canAdd} onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> موظف جديد</Button></div>
      {!canAdd && writable && <p className="text-sm text-muted">وصلت لحد الموظفين في باقتك. رقّي الباقة لإضافة المزيد.</p>}
      <ErrorLine error={role.error} />
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id}>
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold/20">{m.role === "owner" ? <Crown className="size-5" aria-hidden /> : <UserCog className="size-5" aria-hidden />}</div>
              <div className="min-w-0 flex-1"><p className="font-semibold">{m.name}</p><p dir="ltr" className="text-start text-sm text-muted">{m.phone}</p></div>
              {m.role === "owner" ? <Badge tone="gold">{STAFF_ROLE_LABELS.owner}</Badge> : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-40"><Select aria-label={`صلاحية ${m.name}`} value={m.role} disabled={!writable || role.pending} onChange={(e) => role.act(() => changeRoleAction(m.id, e.target.value), "تم تغيير الصلاحية")}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>)}</Select></div>
                  <Button size="sm" variant="outline" disabled={!writable} onClick={() => setResetting(m)}><KeyRound className="size-4" aria-hidden /> كلمة السر</Button>
                  <Button size="sm" variant="ghost" disabled={!writable} aria-label={`حذف ${m.name}`} onClick={() => { del.setError(null); setRemoving(m); }}><Trash2 className="size-4 text-danger-fg" /></Button>
                </div>
              )}
              <p className="w-full text-xs text-muted">انضم {formatDate(m.createdAt)}</p>
            </Card>
          </li>
        ))}
      </ul>
      {adding && <AddForm onClose={() => setAdding(false)} />}
      {resetting && <ResetForm key={resetting.id} member={resetting} onClose={() => setResetting(null)} />}
      <ConfirmModal open={!!removing} onClose={() => setRemoving(null)} danger loading={del.pending} title="حذف الموظف" message={del.error ?? `تحذف «${removing?.name}»؟ حسابه يتقفل ويتسجل خروجه فوراً، والطلبيات والسجل يبقوا.`} confirmLabel="حذف" onConfirm={() => removing && del.act(() => removeStaffAction(removing.id), "تم الحذف", () => setRemoving(null))} />
    </div>
  );
}

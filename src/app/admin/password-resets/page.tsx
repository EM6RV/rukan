import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { getDb } from "@/db";
import { listResetRequests } from "@/server/auth/password-reset";
import { ResetManager } from "./reset-manager";

export const metadata: Metadata = { title: "طلبات كلمة السر" };
export const dynamic = "force-dynamic";

export default async function PasswordResetsPage() {
  const rows = await listResetRequests(getDb());
  return (
    <>
      <div>
        <h1 className="text-2xl">طلبات كلمة السر</h1>
        <p className="text-muted">تأكد من هوية صاحب الطلب (من رقم واتساب اللي يكلمك منه)، وبعدها جهّز الرابط وابعثه له. الرابط صالح ساعة ولمرة وحدة.</p>
      </div>
      {rows.length === 0
        ? <EmptyState icon={<KeyRound className="size-6" />} title="ما فيش طلبات" description="أي بياع ينسى كلمة السر ويطلب استرجاع يظهر هنا." />
        : <ResetManager rows={rows} />}
    </>
  );
}

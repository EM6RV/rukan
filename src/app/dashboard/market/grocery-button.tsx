"use client";

import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { groceryCategoriesAction } from "./actions";

export function GroceryCategoriesButton({ disabled }: { disabled: boolean }) {
  const { act, pending, error } = useAct();
  return (
    <div className="space-y-2">
      <Button variant="outline" loading={pending} disabled={disabled} onClick={() => act(() => groceryCategoriesAction(), "تمت إضافة الأقسام")}>أضف الأقسام</Button>
      {error && <p role="alert" className={errorClass}>{error}</p>}
    </div>
  );
}

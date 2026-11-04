"use client";

import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { seedPlansAction } from "./actions";

export function SeedPlansButton() {
  const { act, pending, error } = useAct();
  return <div className="space-y-2"><Button loading={pending} onClick={() => act(() => seedPlansAction(), "تم تجهيز الأنواع")}>جهّز الأنواع</Button>{error && <p role="alert" className={errorClass}>{error}</p>}</div>;
}

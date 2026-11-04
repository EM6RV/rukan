"use client";

import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { seedStationsAction } from "./actions";

export function SeedStationsButton() {
  const { act, pending, error } = useAct();
  return (
    <div className="space-y-2">
      <Button loading={pending} onClick={() => act(() => seedStationsAction(), "تم تجهيز الأجهزة")}>جهّز الأجهزة</Button>
      {error && <p role="alert" className={errorClass}>{error}</p>}
    </div>
  );
}

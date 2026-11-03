"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { openScanStocktakeAction } from "../actions";

export function OpenStocktake({ warehouses, categories, shelves }: { warehouses: { id: string; name: string; isDefault: boolean }[]; categories: { id: string; name: string }[]; shelves: string[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? "");
  const [scope, setScope] = useState<"all" | "category" | "shelf">("all");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [shelf, setShelf] = useState(shelves[0] ?? "");
  const [lock, setLock] = useState(false);
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title="جرد جديد" />
      <CardBody>
        <form className="grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            const r = await openScanStocktakeAction({ warehouseId, categoryId: scope === "category" ? categoryId : null, shelf: scope === "shelf" ? shelf : null, lock });
            if (r.ok) router.push(`/dashboard/market/stocktake/${r.data.id}`);
            return r;
          }, "بدا الجرد");
        }}>
          {warehouses.length > 1 && <Select label="المخزن" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>}
          <Select label="النطاق" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}><option value="all">كل الأصناف</option><option value="category" disabled={!categories.length}>قسم</option><option value="shelf" disabled={!shelves.length}>رف</option></Select>
          {scope === "category" && <Select label="القسم" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
          {scope === "shelf" && (shelves.length ? <Select label="الرف" value={shelf} onChange={(e) => setShelf(e.target.value)}>{shelves.map((s) => <option key={s} value={s}>{s}</option>)}</Select> : <Input label="الرف" value={shelf} onChange={(e) => setShelf(e.target.value)} />)}
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={lock} onChange={(e) => setLock(e.target.checked)} /> اقفل المخزن أثناء الجرد</label>
          <Button type="submit" loading={pending} disabled={!warehouseId}>ابدا الجرد</Button>
          {error && <p role="alert" className={`${errorClass} sm:col-span-4`}>{error}</p>}
        </form>
      </CardBody>
    </Card>
  );
}

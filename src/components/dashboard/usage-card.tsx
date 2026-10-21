import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { UsageMeter } from "@/components/ui/usage-meter";
import type { StoreUsage } from "@/server/store-usage";

/** «استعملت 48 من 50 منتج» بأشرطة تقدم: المنتجات، الطلبيات هذا الشهر، الموظفين */
export function UsageCard({ usage }: { usage: StoreUsage }) {
  return (
    <Card>
      <CardHeader title="استهلاكك" description="مقابل حدود باقتك" />
      <CardBody className="grid gap-5 sm:grid-cols-3">
        <UsageMeter used={usage.products.used} limit={usage.products.limit} unit="منتج" />
        <UsageMeter used={usage.orders.used} limit={usage.orders.limit} unit="طلبية هذا الشهر" />
        <UsageMeter used={usage.staff.used} limit={usage.staff.limit} unit={usage.staff.limit === 1 ? "موظف" : "موظفين"} />
      </CardBody>
    </Card>
  );
}

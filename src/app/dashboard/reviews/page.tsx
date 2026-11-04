import type { Metadata } from "next";
import { listReviewsForDashboard } from "@/server/reviews";
import { requireStoreContext } from "@/server/store-context";
import { ReviewManager } from "./review-manager";

export const metadata: Metadata = { title: "التقييمات" };

export default async function ReviewsPage() {
  const ctx = await requireStoreContext("marketing");
  const reviews = await listReviewsForDashboard(ctx.scope);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">التقييمات</h1><p className="text-muted">تقييمات الزباين اللي استلموا طلبياتهم. ما تبان في المتجر إلا بعد ما توافق عليها.</p></div>
      <ReviewManager reviews={reviews} canEdit={ctx.access.writable} />
    </div>
  );
}

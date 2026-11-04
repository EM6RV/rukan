import { SkeletonListPage } from "@/components/ui/feedback";

export default function Loading() {
  return <SkeletonListPage filters={false} rows={3} />;
}

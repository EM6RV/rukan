import { Skeleton, SkeletonHeader, SkeletonPage, SkeletonRow } from "@/components/ui/feedback";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="flex items-start justify-between gap-3"><SkeletonHeader /><Skeleton className="h-11 w-28" /></div>
      <Skeleton className="h-12 rounded-xl" />
      <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} thumb />)}</div>
    </SkeletonPage>
  );
}

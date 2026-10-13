import { Skeleton, SkeletonHeader, SkeletonPage, SkeletonRow } from "@/components/ui/feedback";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <div className="flex gap-2 overflow-hidden">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />)}</div>
      <Skeleton className="h-[4.5rem] rounded-2xl" />
      <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</div>
    </SkeletonPage>
  );
}

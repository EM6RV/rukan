import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-2", className)} />
);

export const Spinner = ({ className }: { className?: string }) => (
  <Loader2 role="status" aria-label="جاري التحميل" className={cn("size-5 animate-spin text-muted", className)} />
);

export function EmptyState({
  icon, title, description, action, className,
}: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center", className)}>
      {icon && <div className="flex size-14 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</div>}
      <h3 className="text-lg">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

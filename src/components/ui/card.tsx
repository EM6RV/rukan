import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-soft", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-lg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export const CardBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-5", className)} {...props} />
);

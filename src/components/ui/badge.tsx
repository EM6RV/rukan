import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-surface-2 text-muted",
  navy: "bg-fg text-bg",
  gold: "bg-gold/20 text-fg ring-1 ring-gold/40",
  teal: "bg-teal/12 text-link ring-1 ring-teal/30",
  success: "bg-success/15 text-success-fg ring-1 ring-success/30",
  danger: "bg-danger/15 text-danger-fg ring-1 ring-danger/30",
} as const;

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}

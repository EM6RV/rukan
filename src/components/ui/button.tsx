import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const variants = {
  // الزر الرئيسي: ذهبي والنص كحلي (مش أبيض)
  primary: "bg-gold text-navy hover:brightness-95 active:brightness-90 shadow-soft",
  secondary: "bg-fg text-bg hover:opacity-90 active:opacity-80",
  outline: "border border-line bg-surface text-fg hover:bg-surface-2",
  ghost: "text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-95",
} as const;

const sizes = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-13 px-7 text-base gap-2.5",
} as const;

type Common = { variant?: keyof typeof variants; size?: keyof typeof sizes; fullWidth?: boolean; className?: string };

const classes = ({ variant = "primary", size = "md", fullWidth, className }: Common) =>
  cn(
    "inline-flex items-center justify-center rounded-md font-semibold whitespace-nowrap transition-all duration-150",
    "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
    variants[variant],
    sizes[size],
    fullWidth && "w-full",
    className,
  );

export function Button({
  loading,
  children,
  disabled,
  type = "button",
  ...props
}: Common & React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  const { variant, size, fullWidth, className, ...rest } = props;
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={classes({ variant, size, fullWidth, className })} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant, size, fullWidth, className, ...props
}: Common & React.ComponentProps<typeof Link>) {
  return <Link className={classes({ variant, size, fullWidth, className })} {...props} />;
}

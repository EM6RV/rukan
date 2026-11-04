"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border bg-surface px-3.5 text-[15px] text-fg placeholder:text-muted/70 transition-colors " +
  "focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30 disabled:cursor-not-allowed disabled:opacity-60";

export function Field({
  label, hint, error, htmlFor, children, className,
}: {
  label?: string; hint?: string; error?: string; htmlFor?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger-fg">{error}</p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = React.ComponentProps<"input"> & { label?: string; hint?: string; error?: string };

export function Input({ label, hint, error, className, id, ...props }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <input id={inputId} aria-invalid={!!error || undefined} className={cn(control, "h-11", error ? "border-danger" : "border-line", className)} {...props} />
    </Field>
  );
}

export function PasswordInput({ label, hint, error, className, id, ...props }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <div className="relative">
        <input
          id={inputId}
          type={show ? "text" : "password"}
          aria-invalid={!!error || undefined}
          className={cn(control, "h-11 ps-11", error ? "border-danger" : "border-line", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
          className="absolute inset-y-0 start-0 flex w-11 items-center justify-center text-muted hover:text-fg"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
}

/** حقل رقم هاتف ليبي: لوحة أرقام على الموبايل، اتجاه LTR، وتلميح الصيغة. */
export function PhoneInput({ label = "رقم الهاتف", hint = "مثال: 0912345678", error, className, id, ...props }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <input
        id={inputId}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        placeholder="09X XXX XXXX"
        aria-invalid={!!error || undefined}
        className={cn(control, "h-11 text-right tracking-wide", error ? "border-danger" : "border-line", className)}
        {...props}
      />
    </Field>
  );
}

export function Textarea({
  label, hint, error, className, id, ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; error?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <textarea id={inputId} rows={4} aria-invalid={!!error || undefined} className={cn(control, "py-2.5", error ? "border-danger" : "border-line", className)} {...props} />
    </Field>
  );
}

export function Select({
  label, hint, error, className, id, children, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string; error?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <select id={inputId} aria-invalid={!!error || undefined} className={cn(control, "h-11 appearance-none bg-[length:1rem] bg-[position:left_0.9rem_center] bg-no-repeat pe-3.5 ps-9", error ? "border-danger" : "border-line", className)}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2355646f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
        {...props}>
        {children}
      </select>
    </Field>
  );
}

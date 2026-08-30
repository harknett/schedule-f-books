import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { formatUsd } from "@/lib/money";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted mt-0.5">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-12 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";

const BUTTON_VARIANTS = {
  primary: "bg-accent text-white hover:bg-accent-strong dark:text-[#12140f]",
  secondary: "bg-surface border border-line hover:bg-surface-muted",
  ghost: "hover:bg-surface-muted",
  danger: "border border-danger text-danger hover:bg-danger hover:text-white",
} as const;

type Variant = keyof typeof BUTTON_VARIANTS;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button {...props} className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} />
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...props} className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} />;
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border border-line bg-surface px-3 min-h-12 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${CONTROL} ${className}`} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${CONTROL} py-2.5 min-h-24 ${className}`} />;
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-danger/40 bg-danger/10 text-danger px-3 py-2.5 text-sm"
    >
      {message}
    </p>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="card p-8 text-center">
      <p className="font-medium">{title}</p>
      {body ? <p className="text-sm text-muted mt-1">{body}</p> : null}
    </div>
  );
}

/** A headline number. `tone` colours income green and expenses amber. */
export function Stat({
  label,
  cents,
  tone = "neutral",
  small = false,
}: {
  label: string;
  cents: number;
  tone?: "neutral" | "income" | "expense" | "auto";
  small?: boolean;
}) {
  const resolved = tone === "auto" ? (cents < 0 ? "expense" : "income") : tone;
  const color =
    resolved === "income" ? "text-income" : resolved === "expense" ? "text-expense" : "";
  return (
    <div className="card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`tabular font-semibold ${small ? "text-xl" : "text-2xl"} ${color}`}>
        {formatUsd(cents)}
      </p>
    </div>
  );
}

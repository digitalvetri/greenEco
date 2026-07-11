import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  default: { text: "", icon: "bg-surface text-muted" },
  primary: { text: "text-primary", icon: "bg-primary-50 text-primary" },
  warn: { text: "text-warn", icon: "bg-warn-soft text-warn" },
  danger: { text: "text-danger", icon: "bg-danger-soft text-danger" },
  ok: { text: "text-ok", icon: "bg-ok-soft text-ok" },
};

export function StatTile({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  const body = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-150",
        href && "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-muted">{label}</div>
          <div className={cn("mt-1.5 text-2xl font-bold leading-none tracking-tight tabular-nums", t.text)}>
            {value}
          </div>
          {hint && <div className="mt-1.5 text-[11px] text-muted">{hint}</div>}
        </div>
        {Icon && (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", t.icon)}>
            <Icon className="size-[18px]" />
          </span>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

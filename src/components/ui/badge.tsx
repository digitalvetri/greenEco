import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      variant: {
        default: "bg-surface text-muted ring-border-strong",
        primary: "bg-primary-50 text-primary-700 ring-primary/20",
        ok: "bg-ok-soft text-ok ring-ok/25",
        warn: "bg-warn-soft text-warn ring-warn/25",
        danger: "bg-danger-soft text-danger ring-danger/25",
        review: "bg-orange-50 text-orange-700 ring-orange-300/40",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared table primitives. Every in-app table was hand-rolled with zero
 * horizontal cell padding (adjacent right-aligned numeric columns ran together
 * with no gap) and inconsistent/missing horizontal-scroll wrapping on mobile.
 * `min-w-max` on the table lets columns keep their natural width — the
 * wrapper's overflow-x-auto scrolls instead of squishing columns unreadably.
 */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full min-w-max text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("text-left text-xs text-muted", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-t border-border first:border-t-0", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-3 py-2 font-medium first:pl-0 last:pr-0", className)} {...props} />;
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 first:pl-0 last:pr-0", className)} {...props} />;
}

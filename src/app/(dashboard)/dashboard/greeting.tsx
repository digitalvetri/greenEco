"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";

/** Live date + clock (real, client-side). No fabricated data. */
export function GreetingMeta() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <Clock className="size-5 text-primary" />
        <div className="leading-tight">
          <div className="text-sm font-semibold tabular-nums">
            {now ? now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
          </div>
          <div className="text-[10px] text-muted">IST</div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <CalendarDays className="size-5 text-primary" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">
            {now ? now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
          </div>
          <div className="text-[10px] text-muted">{now ? now.toLocaleDateString("en-IN", { weekday: "long" }) : ""}</div>
        </div>
      </div>
    </div>
  );
}

export function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

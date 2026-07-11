"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

/** Fire a toast from anywhere (client): toast("Saved"), toast("Failed", "error"). */
export function toast(message: string, type: ToastType = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("gc-toast", { detail: { message, type } }));
}

const ICON = { success: CheckCircle2, error: AlertTriangle, info: Info };
const TONE = {
  success: "border-ok/30 text-ok",
  error: "border-danger/30 text-danger",
  info: "border-primary/30 text-primary",
};

let counter = 0;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail as { message: string; type: ToastType };
      const id = ++counter;
      setItems((xs) => [...xs, { id, message, type }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
    };
    window.addEventListener("gc-toast", onToast);
    return () => window.removeEventListener("gc-toast", onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end">
      {items.map((t) => {
        const Icon = ICON[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              "gc-animate-in pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm shadow-lg",
              TONE[t.type],
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 text-foreground">{t.message}</span>
            <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="text-muted hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

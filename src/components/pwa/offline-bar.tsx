"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { count, flush } from "@/lib/offline-queue";

/**
 * Registers the service worker, shows an offline banner, tracks the pending-sync
 * queue count, and flushes it automatically when connectivity returns.
 */
export function OfflineBar() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      } else {
        // Dev: never let a cached service worker serve stale JS chunks (it causes
        // "module factory is not available" after a rebuild). Tear it down.
        navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
        if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
    }
    setOnline(navigator.onLine);
    const refresh = () => count().then(setPending).catch(() => {});
    refresh();

    const onOnline = async () => {
      setOnline(true);
      await flush();
      refresh();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("offline-queue-changed", refresh);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("offline-queue-changed", refresh);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div
      className={
        "fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-2 py-1 text-xs font-medium " +
        (online ? "bg-warn/90 text-white" : "bg-danger/90 text-white")
      }
    >
      {online ? <RefreshCw className="size-3.5" /> : <CloudOff className="size-3.5" />}
      {online
        ? `${pending} field ${pending === 1 ? "entry" : "entries"} pending sync…`
        : "Offline — entries will sync when you reconnect"}
    </div>
  );
}

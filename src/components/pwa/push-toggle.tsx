"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type Status = "checking" | "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * "Enable notifications" toggle (Settings → every role). Requires a real user gesture
 * — browsers reject Notification.requestPermission() called on mount/effect, so this
 * only ever fires from the button's onClick.
 *
 * Only live in production: the service worker is deliberately unregistered in dev
 * (OfflineBar) to avoid serving stale chunks, and push needs an active registration.
 */
export function PushToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [pending, setPending] = useState(false);

  async function refresh() {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    } catch {
      setStatus("unsupported");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function enable() {
    setPending(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Push isn't configured for this deployment yet");

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Could not save your subscription");

      setStatus("on");
      toast("Notifications enabled");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not enable notifications", "error");
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
      toast("Notifications turned off");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not turn off notifications", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        {status === "checking" && <p className="text-sm text-muted">Checking…</p>}

        {status === "unsupported" && (
          <p className="text-sm text-muted">
            {process.env.NODE_ENV !== "production"
              ? "Push notifications only run on the deployed app, not in local development."
              : "Your browser doesn't support push notifications."}
          </p>
        )}

        {status === "denied" && (
          <p className="text-sm text-muted">
            Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload this page.
          </p>
        )}

        {(status === "off" || status === "on") && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {status === "on"
                ? "You'll get alerts for follow-ups, approvals and overdue payments on this device — even when the app is closed."
                : "Get alerts for follow-ups, approvals and overdue payments on this device, even when the app is closed."}
            </p>
            {status === "on" ? (
              <Button type="button" size="sm" variant="outline" onClick={disable} loading={pending}>
                <BellOff className="size-4" /> Turn off
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={enable} loading={pending}>
                <BellRing className="size-4" /> Enable
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

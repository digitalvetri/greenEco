"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { saveConfigAction, clearConfigAction } from "./actions";
import type { ConfigItemView } from "@/server/services/config-admin";

const PROVIDER_OPTIONS = ["auto", "groq", "gemini", "anthropic"];

/** One editable config row. Secret → empty input + last4 badge; non-secret → prefilled value. */
export function IntegrationsForm({ item }: { item: ConfigItemView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Secrets always start empty (we never receive the plaintext). Non-secrets prefill.
  const [value, setValue] = useState(item.secret ? "" : (item.value ?? ""));

  function save() {
    start(async () => {
      const r = await saveConfigAction(item.key, value);
      if (r.ok) {
        toast(`${item.label} saved`);
        if (item.secret) setValue("");
        router.refresh();
      } else {
        toast(r.error ?? "Failed to save", "error");
      }
    });
  }

  function clear() {
    if (!confirm(`Clear ${item.label}? It will fall back to the .env value (or off).`)) return;
    start(async () => {
      const r = await clearConfigAction(item.key);
      if (r.ok) {
        toast(`${item.label} cleared`);
        setValue("");
        router.refresh();
      } else {
        toast(r.error ?? "Failed to clear", "error");
      }
    });
  }

  const statusBadge =
    item.source === "db" ? (
      <Badge variant="ok">
        <Check className="size-3" /> Set{item.last4 ? ` ·••••${item.last4}` : ""}
      </Badge>
    ) : item.source === "env" ? (
      <Badge variant="default">From .env{item.last4 ? ` ·••••${item.last4}` : ""}</Badge>
    ) : (
      <Badge variant="warn">Not set</Badge>
    );

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card/40 p-3 transition-colors hover:border-primary/30">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <label htmlFor={`cfg-${item.key}`} className="text-sm font-medium">
          {item.label}
        </label>
        {statusBadge}
      </div>
      {item.help && <p className="mb-2 text-xs leading-snug text-muted">{item.help}</p>}
      <div className="mt-auto flex items-center gap-2 pt-1">
        {item.key === "AI_TEXT_PROVIDER" ? (
          <Select id={`cfg-${item.key}`} value={value || "auto"} onChange={(e) => setValue(e.target.value)} className="min-w-0 flex-1">
            {PROVIDER_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            id={`cfg-${item.key}`}
            type={item.secret ? "password" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={item.secret ? (item.configured ? "Paste new value to replace" : item.placeholder ?? "Paste value") : item.placeholder}
            autoComplete="off"
            className="min-w-0 flex-1"
          />
        )}
        <Button size="sm" onClick={save} loading={pending} disabled={item.secret && value.trim().length === 0}>
          Save
        </Button>
        {item.source === "db" && (
          <Button size="sm" variant="outline" onClick={clear} disabled={pending} title="Clear this override" aria-label={`Clear ${item.label}`}>
            <RotateCcw className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

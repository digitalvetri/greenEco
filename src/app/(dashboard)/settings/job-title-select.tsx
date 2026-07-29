"use client";

import { useState, useTransition } from "react";
import { Select, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { JOB_TITLES, jobTitleLabel } from "@/lib/job-titles";
import { setUserJobTitleAction } from "./actions";

const CUSTOM = "__custom__";

/** Retroactively assign a job title to an existing user. Cosmetic only.
 *  `value` may be one of the built-in suggestions or any custom text an
 *  admin previously typed — either way it's shown via jobTitleLabel(). */
export function JobTitleSelect({ userId, value }: { userId: string; value: string | null }) {
  const [pending, start] = useTransition();
  const isKnown = !value || (JOB_TITLES as readonly string[]).includes(value);
  const [customMode, setCustomMode] = useState(!isKnown);
  const [customValue, setCustomValue] = useState(isKnown ? "" : value ?? "");

  function save(next: string | null) {
    start(async () => {
      const res = await setUserJobTitleAction(userId, next);
      if (!res.ok) toast(res.error ?? "Could not update job title", "error");
    });
  }

  if (customMode) {
    return (
      <Input
        aria-label="Job title"
        value={customValue}
        disabled={pending}
        placeholder="Type a title…"
        className="h-7 py-0 text-xs"
        onChange={(e) => setCustomValue(e.target.value)}
        onBlur={() => save(customValue || null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setCustomMode(false);
            setCustomValue("");
          }
        }}
      />
    );
  }

  return (
    <Select
      aria-label="Job title"
      value={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        if (e.target.value === CUSTOM) {
          setCustomMode(true);
          return;
        }
        save(e.target.value || null);
      }}
      className="h-7 py-0 text-xs"
    >
      <option value="">— No title —</option>
      {JOB_TITLES.map((t) => (
        <option key={t} value={t}>
          {jobTitleLabel(t)}
        </option>
      ))}
      <option value={CUSTOM}>+ Create new title…</option>
    </Select>
  );
}

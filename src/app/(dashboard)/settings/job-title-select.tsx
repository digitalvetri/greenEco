"use client";

import { useTransition } from "react";
import type { JobTitle } from "@prisma/client";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { JOB_TITLES, JOB_TITLE_LABELS } from "@/lib/job-titles";
import { setUserJobTitleAction } from "./actions";

/** Retroactively assign a job title to an existing user. Cosmetic only. */
export function JobTitleSelect({ userId, value }: { userId: string; value: JobTitle | null }) {
  const [pending, start] = useTransition();

  function change(next: string) {
    start(async () => {
      const res = await setUserJobTitleAction(userId, (next as JobTitle) || null);
      if (!res.ok) toast(res.error ?? "Could not update job title", "error");
    });
  }

  return (
    <Select
      aria-label="Job title"
      value={value ?? ""}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      className="h-7 py-0 text-xs"
    >
      <option value="">— No title —</option>
      {JOB_TITLES.map((t) => (
        <option key={t} value={t}>
          {JOB_TITLE_LABELS[t]}
        </option>
      ))}
    </Select>
  );
}

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/ui/input";

const TYPES = [
  { value: "", label: "All types" },
  { value: "CALL", label: "Call" },
  { value: "SITE_VISIT", label: "Site visit" },
  { value: "MEETING", label: "Meeting" },
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "OTHER", label: "Other" },
  { value: "TASK", label: "Auto tasks only" },
];

const STATUSES = [
  { value: "", label: "Still open" },
  { value: "overdue", label: "Overdue" },
  { value: "pending", label: "Not yet due" },
  { value: "completed", label: "Completed" },
];

const HORIZONS = [
  { value: "7", label: "Next 7 days" },
  { value: "30", label: "Next 30 days" },
  { value: "90", label: "Next 90 days" },
  { value: "365", label: "Next year" },
];

/**
 * URL-driven so a filtered worklist is shareable and survives a refresh — the same
 * pattern the leads list uses. The calendar view reads `type`/`owner`/`status` from
 * the same params, so switching views keeps the filter.
 */
export function FollowUpsFilters({
  owners,
  showOwner,
  showHorizon,
}: {
  owners: { id: string; name: string }[];
  showOwner: boolean;
  showHorizon: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Select
        aria-label="Filter by type"
        className="h-9 w-auto"
        value={params.get("type") ?? ""}
        onChange={(e) => set("type", e.target.value)}
      >
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filter by status"
        className="h-9 w-auto"
        value={params.get("status") ?? ""}
        onChange={(e) => set("status", e.target.value)}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>

      {showOwner && (
        <Select
          aria-label="Filter by owner"
          className="h-9 w-auto"
          value={params.get("owner") ?? ""}
          onChange={(e) => set("owner", e.target.value)}
        >
          <option value="">All owners</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      )}

      {showHorizon && (
        <Select
          aria-label="How far ahead to look"
          className="h-9 w-auto"
          value={params.get("days") ?? "30"}
          onChange={(e) => set("days", e.target.value)}
        >
          {HORIZONS.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

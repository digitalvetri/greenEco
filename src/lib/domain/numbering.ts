/**
 * Sequential document numbering (spec §7.2/§7.3). Numbers are never reused.
 * Format: {PREFIX}-{YEAR}-{NNN} e.g. GEC-INV-2026-001.
 * Allocation (DB row-lock) lives in the service layer; this is the pure formatter.
 */

export type DocKind = "INVOICE" | "ORDER" | "PROPOSAL" | "PO" | "AMC" | "TICKET" | "GRN";

export function formatDocNumber(prefix: string, year: number, seq: number, pad = 3): string {
  return `${prefix}-${year}-${String(seq).padStart(pad, "0")}`;
}

/** Parse a formatted number back into parts (for validation/tests). */
export function parseDocNumber(
  value: string,
): { prefix: string; year: number; seq: number } | null {
  const m = /^(.+)-(\d{4})-(\d+)$/.exec(value);
  if (!m) return null;
  return { prefix: m[1], year: Number(m[2]), seq: Number(m[3]) };
}

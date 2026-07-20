import type { CSSProperties } from "react";

/**
 * Table cell styles for /print/* pages. Deliberately NOT in print-shell.tsx (a "use
 * client" module) — Next.js doesn't reliably support importing plain-object exports
 * (as opposed to components) from a client module into a Server Component. Spreading
 * such an object (`{...th, textAlign: "right"}`) silently drops every property except
 * the override; passing the object directly (`style={th}`) happens to still work,
 * which made this bug easy to miss on every /print/* table's non-spread header cells.
 * This plain module has no client boundary to cross, so both usages work correctly.
 */
export const td: CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #eee", fontSize: 13 };
export const th: CSSProperties = {
  padding: "6px 8px",
  borderBottom: "2px solid #0f7a4d",
  fontSize: 12,
  textAlign: "left",
  color: "#0f7a4d",
};

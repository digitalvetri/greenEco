import type { CSSProperties } from "react";

/**
 * Shared building blocks for the Project Report / BOQ print templates.
 *
 * A plain (non-"use client") module for the same reason `print-styles.ts` is — Next.js
 * doesn't reliably support importing plain-object exports from a client module into a
 * Server Component, and spreading such an object silently drops every property except
 * the override. That bug shipped unnoticed on every /print/* table until v30; don't
 * reintroduce it by moving these into print-shell.tsx.
 */

export const BRAND = "#0f7a4d";

export const docSection: CSSProperties = { marginBottom: 18 };

export const docH2: CSSProperties = {
  color: BRAND,
  fontSize: 15,
  fontWeight: 700,
  margin: "0 0 8px",
  paddingBottom: 4,
  borderBottom: `1px solid ${BRAND}33`,
};

export const docH3: CSSProperties = { fontSize: 13.5, fontWeight: 700, margin: "10px 0 5px" };

export const docP: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.6,
  margin: "0 0 8px",
  whiteSpace: "pre-wrap",
  textAlign: "justify",
};

/** Forces the next section onto a fresh page in the generated PDF. */
export const pageBreak: CSSProperties = { pageBreakBefore: "always" };

/** Keeps a block from being split across a page boundary (tables, flow-chart nodes). */
export const avoidBreak: CSSProperties = { pageBreakInside: "avoid" };

/** A numbered document section heading, e.g. "6. Process Design of the Plant". */
export function DocSection({
  no,
  title,
  children,
  breakBefore,
}: {
  no?: number | string;
  title: string;
  children?: React.ReactNode;
  breakBefore?: boolean;
}) {
  return (
    <section style={{ ...docSection, ...(breakBefore ? pageBreak : {}) }}>
      {/* Their section headings are numbered AND end with a colon — "4. Introduction:". */}
      <h2 style={docH2}>{no != null ? `${no}. ${title}:` : title}</h2>
      {children}
    </section>
  );
}

/** Renders text that may contain "•" or "1." bullets as a real list, else paragraphs. */
export function DocProse({ text }: { text: string }) {
  if (!text?.trim()) return null;
  const lines = text.split("\n").map((l) => l.trim());
  const items = lines.filter(Boolean);
  const isBulleted = items.length > 0 && items.every((l) => /^([•\-*]|\d+[.)])\s/.test(l));
  if (isBulleted) {
    // A NUMBERED source must print numbered. The client's "Points to be Noted",
    // "Taxes & Duties" and scope lists are all numbered in their own documents;
    // rendering them as a <ul> silently stripped the numbering and made a nine-point
    // list unreferenceable ("as per point 5" no longer resolves to anything).
    const numbered = items.every((l) => /^\d+[.)]\s/.test(l));
    const Tag = numbered ? "ol" : "ul";
    return (
      <Tag
        style={{
          fontSize: 12.5,
          lineHeight: 1.6,
          margin: "0 0 8px",
          paddingLeft: 20,
          // Tailwind preflight sets `list-style: none` on ol/ul globally, so state it.
          listStyleType: numbered ? "decimal" : "disc",
        }}
      >
        {items.map((l, i) => (
          <li key={i} style={{ marginBottom: 3 }}>
            {l.replace(/^([•\-*]|\d+[.)])\s*/, "")}
          </li>
        ))}
      </Tag>
    );
  }
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((para, i) => (
          <p key={i} style={docP}>
            {para.trim()}
          </p>
        ))}
    </>
  );
}

/** Two-column key/value table used for the inlet/outlet parameter blocks. */
export function ParameterTable({
  heading,
  rows,
}: {
  heading: string;
  rows: { parameter: string; value: string }[];
}) {
  if (!rows.length) return null;
  return (
    <div style={{ ...avoidBreak, display: "inline-block", verticalAlign: "top", width: "48%", marginRight: "3%" }}>
      <div style={docH3}>{heading}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        {/* The client's own inlet/outlet tables carry a Parameter | Value header row. */}
        <thead>
          <tr>
            <th style={{ ...docHeadCell, width: "45%" }}>Parameter</th>
            <th style={docHeadCell}>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...cell, width: "45%", fontWeight: 600 }}>{r.parameter}</td>
              <td style={cell}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cell: CSSProperties = { border: "1px solid #ccc", padding: "4px 7px", fontSize: 12 };
export const docCell = cell;

export const docHeadCell: CSSProperties = {
  border: "1px solid #ccc",
  padding: "5px 7px",
  fontSize: 12,
  fontWeight: 700,
  background: "#f2f7f4",
  color: BRAND,
  textAlign: "left",
};

/**
 * The §6.5 process-flow chart.
 *
 * The samples draw a simple vertical box-and-arrow chain with two side branches
 * (sludge digester off the biological/settling stage, chlorine dosing into filtration).
 * Plain CSS boxes + arrow glyphs render reliably through headless Chromium — no SVG
 * layout maths, and it degrades gracefully in the browser's own print preview.
 */
export function ProcessFlowChart({
  nodes,
  sludgeBranchAfter,
  dosingBranchAt,
  title,
}: {
  nodes: string[];
  sludgeBranchAfter?: string;
  dosingBranchAt?: string;
  title: string;
}) {
  if (!nodes.length) return null;
  return (
    <div style={{ ...avoidBreak, textAlign: "center", margin: "10px 0" }}>
      <div style={{ ...docH3, textAlign: "center", marginBottom: 10 }}>{title}</div>
      {nodes.map((node, i) => (
        <div key={i}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            {/* Left branch — sludge digester */}
            <div style={{ width: 150, textAlign: "right", fontSize: 10.5 }}>
              {sludgeBranchAfter === node ? (
                <span style={branchBox}>SLUDGE DIGESTER&nbsp;→</span>
              ) : null}
            </div>
            <div style={flowBox}>{node}</div>
            {/* Right branch — chlorine dosing */}
            <div style={{ width: 150, textAlign: "left", fontSize: 10.5 }}>
              {dosingBranchAt === node ? <span style={branchBox}>←&nbsp;CHLORINE DOSING TANK</span> : null}
            </div>
          </div>
          {i < nodes.length - 1 && (
            <div style={{ color: BRAND, fontSize: 14, lineHeight: 1, margin: "2px 0" }}>▼</div>
          )}
        </div>
      ))}
    </div>
  );
}

const flowBox: CSSProperties = {
  border: `1.5px solid ${BRAND}`,
  borderRadius: 4,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 600,
  minWidth: 210,
  background: "#f7fbf9",
};

const branchBox: CSSProperties = {
  border: "1px solid #999",
  borderRadius: 4,
  padding: "3px 6px",
  fontSize: 9.5,
  color: "#444",
  whiteSpace: "nowrap",
  background: "#fafafa",
};

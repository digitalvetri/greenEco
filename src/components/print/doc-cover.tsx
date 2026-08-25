import type { CompanySettings } from "@/server/services/company-settings";
import { BRAND, pageBreak } from "./doc-primitives";

/**
 * The cover page shared by the Project Report and the BOQ Proposal.
 *
 * Matches the client's samples: a Ref/Date line, the proposal title naming capacity,
 * project and location, then "Submitted To" (the customer, with Kind Attn) and
 * "Submitted By" (Green Ecocare's full letterhead with branches).
 *
 * The `PrintShell`'s own branded header is suppressed on these documents — the samples
 * put the letterhead in the Submitted By block instead, and having both looks wrong.
 */
export function DocCover({
  refNo,
  date,
  title,
  company,
  customerName,
  customerAddress,
  kindAttn,
}: {
  refNo: string;
  date: Date;
  title: string;
  company: CompanySettings;
  customerName: string;
  customerAddress: string;
  kindAttn?: string | null;
}) {
  return (
    <section style={{ ...pageBreak, pageBreakAfter: "always", minHeight: "23cm" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 40 }}>
        <span>
          <strong>Ref. No:</strong> {refNo}
        </span>
        <span>
          <strong>Date:</strong>{" "}
          {date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
        </span>
      </div>

      <h1
        style={{
          fontSize: 19,
          lineHeight: 1.5,
          fontWeight: 700,
          textAlign: "center",
          color: BRAND,
          margin: "0 auto 44px",
          maxWidth: "85%",
        }}
      >
        {title}
      </h1>

      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={label}>Submitted To</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{customerName}</div>
        {customerAddress && (
          <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", marginTop: 2 }}>{customerAddress}</div>
        )}
        {kindAttn && <div style={{ fontSize: 12.5, marginTop: 8 }}>Kind Attn: {kindAttn}</div>}
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={label}>Submitted By</div>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by headless Chromium into a PDF, not the Next image pipeline */}
        <img src="/brand/logo-mark.png" alt="" width={54} height={54} style={{ marginBottom: 6 }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND }}>{company.name}</div>
        {company.address && (
          <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", marginTop: 2 }}>{company.address}</div>
        )}
        {company.phone && <div style={{ fontSize: 12.5 }}>Mob: {company.phone}</div>}
        {company.email && <div style={{ fontSize: 12.5 }}>Email: {company.email}</div>}
        {company.branches.length > 0 && (
          <div style={{ fontSize: 12.5, marginTop: 4 }}>Branch Office: {company.branches.join(", ")}.</div>
        )}
        {company.gstin && <div style={{ fontSize: 11.5, color: "#555", marginTop: 4 }}>GSTIN: {company.gstin}</div>}
      </div>
    </section>
  );
}

const label = {
  fontSize: 12,
  fontStyle: "italic" as const,
  color: "#666",
  marginBottom: 6,
};

/** "Yours faithfully / For Green Ecocare / signatory" closing used on both documents. */
export function DocSignature({
  company,
  signatoryName,
  signatoryTitle,
  signatoryPhone,
  faithfully = false,
}: {
  company: CompanySettings;
  signatoryName: string;
  signatoryTitle: string;
  signatoryPhone?: string;
  faithfully?: boolean;
}) {
  return (
    <div style={{ marginTop: 28, fontSize: 12.5, pageBreakInside: "avoid" }}>
      {faithfully && <div style={{ marginBottom: 10 }}>Yours faithfully,</div>}
      <div style={{ fontWeight: 700 }}>For {company.name.toUpperCase()},</div>
      <div style={{ height: 34 }} />
      <div style={{ fontWeight: 700 }}>{signatoryName}</div>
      {signatoryPhone && <div>{signatoryPhone}</div>}
      <div>{signatoryTitle}</div>
    </div>
  );
}

import Link from "next/link";
import { FileText, FileClock, AlarmClock, IndianRupee, BarChart3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listProposals, proposalStats } from "@/server/services/proposal";
import { PageHeader, StatTile } from "@/components/ui/stat";
import { ProposalsList, type ProposalRow } from "./proposals-list";
import { ProposalsSearch } from "./proposals-search";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "SENT", label: "Sent" },
  { key: "UNDER_NEGOTIATION", label: "Negotiating" },
  { key: "expired", label: "Expiring" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
];

function compactINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { status, search } = await searchParams;
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";

  const [{ items, nextCursor }, stats] = await Promise.all([
    listProposals(session, { status: status || undefined, search: search || undefined, take: 50 }),
    proposalStats(session),
  ]);

  const persist: Record<string, string> = {};
  if (search) persist.search = search;
  const query = new URLSearchParams({ ...persist, ...(status ? { status } : {}) }).toString();
  const tabHref = (key: string) => {
    const p = new URLSearchParams(persist);
    if (key) p.set("status", key);
    const s = p.toString();
    return s ? `/proposals?${s}` : "/proposals";
  };

  const rows: ProposalRow[] = items.map((p) => {
    const v = p.versions[0];
    return {
      id: p.id,
      number: p.number,
      status: p.status,
      projectName: p.projectName,
      plantType: p.plantType,
      technology: p.technology,
      capacityKLD: p.capacityKLD,
      grandTotal: v ? String(v.grandTotal) : null,
      aiGenerated: v?.aiGenerated ?? false,
      orderNo: p.order?.orderNo ?? null,
      expiry: p.expiry,
    };
  });

  return (
    <div>
      <PageHeader
        title="Proposals"
        subtitle={`${items.length}${nextCursor ? "+" : ""} shown`}
        action={
          <Link
            href="/proposals/analytics"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
          >
            <BarChart3 className="size-4" /> Analytics
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="In play" value={stats.inPlay} icon={FileText} tone="primary" href={tabHref("SENT")} />
        <StatTile label="Awaiting finalisation" value={stats.draft} icon={FileClock} tone="default" href={tabHref("DRAFT")} />
        <StatTile
          label="Expiring soon"
          value={stats.expiring}
          icon={AlarmClock}
          tone={stats.expiring > 0 ? "warn" : "default"}
          href={tabHref("expired")}
        />
        <StatTile
          label="Open pipeline"
          value={stats.pipelineValue > 0 ? compactINR(stats.pipelineValue) : "—"}
          hint={`${stats.won} won`}
          icon={IndianRupee}
          tone="ok"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = (t.key === "" && !status) || status === t.key;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <ProposalsSearch />

      <ProposalsList key={query} initialItems={rows} initialCursor={nextCursor} query={query} isAdmin={isAdmin} />
    </div>
  );
}

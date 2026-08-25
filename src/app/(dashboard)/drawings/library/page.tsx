import type { Metadata } from "next";
import Link from "next/link";
import { Library } from "lucide-react";
import { getSession } from "@/lib/auth";
import { hasCapability, CAPABILITIES } from "@/lib/rbac";
import { listDrawings, DRAWING_DISCIPLINES } from "@/server/services/drawing";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DrawingsNav } from "../drawings-nav";
import { ApprovalControl } from "./approval-control";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Drawing library — Green Ecocare CRM" };

/**
 * Every drawing in the company, with **revision history** — which the project page's
 * Drawings tab has never shown: it filters to `isCurrent`, so Rev A disappears the
 * moment Rev B lands. Here history is one toggle away.
 *
 * Also the first place `setDrawingApproval` is reachable from. That service function
 * has existed, admin-guarded and audited, since Phase 2 with zero call sites — meaning
 * FOR_APPROVAL and APPROVED were unreachable and every drawing read "DRAFT" forever.
 */
export default async function DrawingLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ discipline?: string; search?: string; history?: string }>;
}) {
  const { discipline, search, history } = await searchParams;
  const session = await getSession();
  const canDraw = hasCapability(session, CAPABILITIES.DRAWINGS);
  const includeHistory = history === "1";

  const { items } = await listDrawings(session, {
    discipline: discipline || undefined,
    search: search || undefined,
    includeHistory,
    take: 100,
  });

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { discipline, search, history, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/drawings/library?${s}` : "/drawings/library";
  };

  return (
    <div>
      <PageHeader
        title="Drawing library"
        subtitle={`${items.length} ${includeHistory ? "drawings including past revisions" : "current drawings"}`}
      />
      <DrawingsNav canDraw={canDraw} />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link
          href={href({ discipline: undefined })}
          className={
            "rounded-full px-3 py-1 text-xs font-medium " +
            (!discipline ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")
          }
        >
          All
        </Link>
        {DRAWING_DISCIPLINES.map((d) => (
          <Link
            key={d}
            href={href({ discipline: d })}
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (discipline === d ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")
            }
          >
            {d}
          </Link>
        ))}
        <Link
          href={href({ history: includeHistory ? undefined : "1" })}
          className={
            "ml-auto rounded-full px-3 py-1 text-xs font-medium " +
            (includeHistory ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted")
          }
        >
          {includeHistory ? "Showing all revisions" : "Show revision history"}
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No drawings yet"
          description="Drawings delivered against a request appear here, with every revision."
        />
      ) : (
        <div className="space-y-2">
          {items.map((d) => (
            <Card key={d.id} className="p-3">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">Rev {d.revision}</Badge>
                    {d.isCurrent ? (
                      <Badge variant="ok">Current</Badge>
                    ) : (
                      <Badge variant="default">Superseded</Badge>
                    )}
                    <span className="text-xs text-muted">{d.discipline}</span>
                  </div>
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block truncate font-medium text-primary hover:underline"
                  >
                    {d.title}
                  </a>
                  <div className="text-xs text-muted">
                    {[
                      d.order ? (d.order.clientName || d.order.orderNo) : "Not linked to a project",
                      new Date(d.createdAt).toLocaleDateString("en-IN"),
                    ].join(" · ")}
                  </div>
                  {d.changeNote && (
                    <p className="mt-1 text-xs text-warn">Revised because: {d.changeNote}</p>
                  )}
                </div>

                <ApprovalControl
                  drawingId={d.id}
                  status={d.approvalStatus}
                  isAdmin={session.role === "ADMIN"}
                  superseded={!d.isCurrent}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

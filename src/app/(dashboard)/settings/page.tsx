import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getMyProfile } from "@/server/services/profile";
import { getSystemStatus, type SystemStatusItem } from "@/server/services/system";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, MinusCircle } from "lucide-react";
import { DEFAULT_STAGES } from "@/lib/constants";
import { ProfileCard } from "./profile-card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";
  const [profile, users] = await Promise.all([
    getMyProfile(session),
    isAdmin
      ? prisma.user.findMany({ where: { companyId: session.companyId }, orderBy: { role: "asc" } })
      : Promise.resolve([]),
  ]);
  const status = isAdmin ? await getSystemStatus(session) : null;

  return (
    <div>
      <PageHeader title="Settings" subtitle={isAdmin ? "Your profile, team & workspace" : "Your profile & account"} />

      {/* Available to every role — your own account. */}
      <ProfileCard profile={profile} />

      {!isAdmin ? null : (
      <>
      <h2 className="mb-3 mt-6 text-sm font-semibold text-muted">Workspace (admin)</h2>

      {status && (
        <Card className="mb-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>System readiness</CardTitle>
            <div className="flex items-center gap-3">
              <Link href="/settings/integrations" className="text-xs font-medium text-primary hover:underline">
                Manage keys →
              </Link>
              <Badge variant={status.liveCount === status.total ? "ok" : "warn"}>
                {status.liveCount}/{status.total} live
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {[...status.auth, ...status.integrations, ...status.observability].map((s) => (
              <StatusRow key={s.key} item={s} />
            ))}
            <p className="mt-2 text-[11px] text-muted sm:col-span-2">
              Derived from environment config (no secrets shown). Unset integrations fail safe — messages are logged, not sent.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted">{u.phone}</div>
                </div>
                <Badge variant={u.role === "ADMIN" ? "primary" : "default"}>{u.role}</Badge>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted">
              User management is via Clerk in production (roles in <code>publicMetadata.role</code>).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company & Thresholds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="GSTIN" value={env.companyGstin || "—"} />
            <Row label="State code" value={env.companyStateCode} />
            <Row label="Invoice prefix" value={env.invoicePrefix} />
            <Row label="Min margin %" value={`${(env.minMarginPct * 100).toFixed(0)}%`} />
            <Row label="Auto-approve limit" value={env.autoApproveLimit === 0 ? "All manual" : `₹${env.autoApproveLimit}`} />
            <p className="pt-2 text-xs text-muted">Configured via environment variables (.env).</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Milestone / Stage Template</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_STAGES.map((s, i) => (
              <Badge key={s} variant="default">
                {i + 1}. {s}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Default payment terms: 50% advance / 30% delivery / 20% commissioning — confirm with client;
            overridable per proposal. See <code>GO-LIVE.md</code>.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Masters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Link href="/settings/integrations" className="text-primary">Integrations & API keys →</Link>
          <Link href="/settings/automations" className="text-primary">Automations →</Link>
          <Link href="/materials" className="text-primary">Items & Vendors →</Link>
          <Link href="/reports" className="text-primary">Reports →</Link>
          <a href="/api/cron?job=all" target="_blank" rel="noreferrer" className="text-primary">Run cron digest →</a>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function StatusRow({ item }: { item: SystemStatusItem }) {
  return (
    <div className="flex items-start gap-2 py-1">
      {item.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
      ) : (
        <MinusCircle className="mt-0.5 size-4 shrink-0 text-muted/60" />
      )}
      <div className="min-w-0">
        <div className="font-medium">{item.label}</div>
        <div className="text-[11px] text-muted">{item.detail}</div>
      </div>
    </div>
  );
}

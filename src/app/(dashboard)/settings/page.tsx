import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getMyProfile } from "@/server/services/profile";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle={isAdmin ? "Your profile, team & workspace" : "Your profile & account"} />

      {/* Available to every role — your own account. */}
      <ProfileCard profile={profile} />

      {!isAdmin ? null : (
      <>
      <h2 className="mb-3 mt-6 text-sm font-semibold text-muted">Workspace (admin)</h2>
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
          <p className="mt-2 text-xs text-muted">Default payment terms: 50% advance / 30% delivery / 20% commissioning.</p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Masters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
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

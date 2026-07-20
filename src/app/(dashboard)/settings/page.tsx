import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMyProfile } from "@/server/services/profile";
import { getSettingsFor } from "@/server/services/company-settings";
import { getSystemStatus, type SystemStatusItem } from "@/server/services/system";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, MinusCircle } from "lucide-react";
import { DEFAULT_STAGES } from "@/lib/constants";
import { ProfileCard } from "./profile-card";
import { CompanyDetailsCard, ThresholdsCard } from "./company-settings-cards";
import { ResetPasswordButton } from "./reset-password-button";
import { CreateUserButton } from "./create-user-button";
import { JobTitleSelect } from "./job-title-select";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const isAdmin = session.role === "ADMIN";
  const [profile, users, companySettings] = await Promise.all([
    getMyProfile(session),
    isAdmin
      ? prisma.user.findMany({ where: { companyId: session.companyId }, orderBy: { role: "asc" } })
      : Promise.resolve([]),
    isAdmin ? getSettingsFor(session) : Promise.resolve(null),
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
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Users</CardTitle>
            {env.authMode !== "clerk" && <CreateUserButton />}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary storage URL
                    <img src={u.avatarUrl} alt={u.name} className="size-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {u.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{u.name}</div>
                    <div className="text-xs text-muted">{u.phone}</div>
                    <div className="mt-1 w-32">
                      <JobTitleSelect userId={u.id} value={u.jobTitle} />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={u.role === "ADMIN" ? "primary" : "default"}>{u.role}</Badge>
                  <ResetPasswordButton userId={u.id} name={u.name} />
                </div>
              </div>
            ))}
            {env.authMode === "clerk" && (
              <p className="pt-2 text-xs text-muted">
                Adding a new user is via Clerk in production (roles in <code>publicMetadata.role</code>).
              </p>
            )}
          </CardContent>
        </Card>

        {companySettings && <ThresholdsCard settings={companySettings} />}
      </div>

      {companySettings && (
        <div className="mt-4">
          <CompanyDetailsCard settings={companySettings} />
        </div>
      )}

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
            overridable per proposal.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>System</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/settings/integrations"
            className="rounded-lg border border-border bg-surface px-3 py-2 font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            Integrations & API keys →
          </Link>
          <Link
            href="/settings/automations"
            className="rounded-lg border border-border bg-surface px-3 py-2 font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            Automations →
          </Link>
          <Link
            href="/settings/activity"
            className="rounded-lg border border-border bg-surface px-3 py-2 font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            Activity log →
          </Link>
        </CardContent>
      </Card>
      </>
      )}
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

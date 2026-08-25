import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMyProfile } from "@/server/services/profile";
import { getSettingsFor } from "@/server/services/company-settings";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Zap, ScrollText } from "lucide-react";
import { PushToggle } from "@/components/pwa/push-toggle";
import { ProfileCard } from "./profile-card";
import { CompanyDetailsCard, ThresholdsCard } from "./company-settings-cards";
import { ProposalDocumentCard } from "./proposal-document-card";
import { ResetPasswordButton } from "./reset-password-button";
import { EditUserButton } from "./edit-user-button";
import { DeleteUserButton } from "./delete-user-button";
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

  return (
    <div>
      <PageHeader title="Settings" subtitle={isAdmin ? "Your profile, team & workspace" : "Your profile & account"} />

      {/* Available to every role — your own account. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileCard profile={profile} />
        <PushToggle />
      </div>

      {!isAdmin ? null : (
      <>
      <h2 className="mb-3 mt-6 text-sm font-semibold text-muted">Workspace (admin)</h2>

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
                    <div className="mt-1 w-44">
                      <JobTitleSelect userId={u.id} value={u.jobTitle} />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    {!u.active && <Badge variant="danger">Deactivated</Badge>}
                    <Badge variant={u.role === "ADMIN" ? "primary" : "default"}>{u.role}</Badge>
                  </div>
                  {u.id !== session.userId && (
                    <EditUserButton userId={u.id} name={u.name} phone={u.phone} email={u.email} role={u.role} active={u.active} capabilities={u.capabilities} />
                  )}
                  <ResetPasswordButton userId={u.id} name={u.name} />
                  {u.id !== session.userId && <DeleteUserButton userId={u.id} name={u.name} />}
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
        <div className="mt-4 space-y-4">
          <CompanyDetailsCard settings={companySettings} />
          <ProposalDocumentCard doc={companySettings.doc} />
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <QuickLink href="/settings/integrations" icon={KeyRound} title="Integrations & API keys" subtitle="WhatsApp, email, AI providers" />
        <QuickLink href="/settings/automations" icon={Zap} title="Automations" subtitle="Reminders, alerts, digests" />
        <QuickLink href="/settings/activity" icon={ScrollText} title="Activity log" subtitle="Every change, audited" />
      </div>
      </>
      )}
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: typeof KeyRound;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="truncate text-xs text-muted">{subtitle}</div>
      </div>
    </Link>
  );
}

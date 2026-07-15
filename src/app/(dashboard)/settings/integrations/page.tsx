import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getConfigOverview } from "@/server/services/config-admin";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IntegrationsForm } from "./integrations-form";

export const dynamic = "force-dynamic";

const GROUP_BLURB: Record<string, string> = {
  Cron: "The shared secret your scheduler sends so only you can trigger automations.",
  WhatsApp: "Send reminders/digests and receive replies. Cloud API token pair OR an n8n relay URL.",
  Email: "Transactional email via Resend (proposals, alerts).",
  AI: "Proposal drafts + weekly brief + bill-photo reading. Any one provider is enough for text; vision needs Claude or Gemini.",
};

export default async function IntegrationsSettingsPage() {
  const session = await getSession();
  if (session.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Integrations" />
        <Card className="p-8 text-center text-sm text-muted">Integration keys are managed by admins only.</Card>
      </div>
    );
  }

  const groups = await getConfigOverview(session);
  const liveCount = groups.flatMap((g) => g.items).filter((i) => i.source !== "unset").length;
  const total = groups.flatMap((g) => g.items).length;

  return (
    <div>
      <Link href="/settings" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <PageHeader
        title="Integrations & API keys"
        subtitle="Paste keys here to turn on WhatsApp, email, and AI — no restart needed. They override .env and are encrypted at rest."
        action={
          <Badge variant={liveCount === total ? "ok" : "warn"} className="h-8 px-3">
            {liveCount}/{total} configured
          </Badge>
        }
      />

      <Card className="mb-4 border-primary/30 bg-primary/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-medium">How this works</p>
            <p className="text-muted">
              Each field overrides the matching <code>.env</code> value the moment you save. Secret values are never shown
              back — only the last 4 characters, so you can tell one is set. Leave a field blank and Save to clear it
              (it falls back to <code>.env</code>). Watch <Link href="/settings" className="text-primary hover:underline">System readiness</Link> turn green.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {groups.map((g) => {
          const configured = g.items.filter((i) => i.source !== "unset").length;
          return (
            <Card key={g.group}>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <CardTitle>{g.group}</CardTitle>
                  {GROUP_BLURB[g.group] && <p className="max-w-2xl text-xs text-muted">{GROUP_BLURB[g.group]}</p>}
                </div>
                <Badge variant={configured === g.items.length ? "ok" : configured > 0 ? "primary" : "default"} className="shrink-0">
                  {configured}/{g.items.length}
                </Badge>
              </CardHeader>
              {/* Full-width: two keys per row on large screens (inputs stay wide enough to paste
                  long tokens) instead of one long single-column scroll. */}
              <CardContent className="grid items-start gap-3 lg:grid-cols-2">
                {g.items.map((item) => (
                  <IntegrationsForm key={item.key} item={item} />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

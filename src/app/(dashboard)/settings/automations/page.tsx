import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getAutomationsOverview } from "@/server/services/automation-admin";
import { getSetting } from "@/server/automations/engine";
import { PageHeader } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AutomationsTable } from "./automations-table";
import { AdminPhonesForm } from "./admin-phones-form";

export const dynamic = "force-dynamic";

export default async function AutomationsSettingsPage() {
  const session = await getSession();
  if (session.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Automations" />
        <Card className="p-8 text-center text-sm text-muted">Automations are managed by admins only.</Card>
      </div>
    );
  }
  const [items, adminPhones] = await Promise.all([
    getAutomationsOverview(session),
    getSetting<string[]>(session.companyId, "adminPhones", []),
  ]);
  const live = items.filter((i) => i.enabled).length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Automations"
        subtitle={`${live}/${items.length} enabled · WhatsApp / push / email delivery`}
        action={
          <Link href="/settings" className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="size-4" /> Settings
          </Link>
        }
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Admin recipients</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminPhonesForm initial={adminPhones.join(", ")} />
          <p className="mt-2 text-[11px] text-muted">
            Admin-only messages (digests, budget & receivables alerts) go to these WhatsApp numbers. 10-digit, comma-separated.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automations</CardTitle>
        </CardHeader>
        <CardContent>
          <AutomationsTable items={items} />
          <p className="mt-3 text-[11px] text-muted">
            &ldquo;Dry run&rdquo; computes what would send without sending. Unset delivery channels are logged, never sent. See <code>AUTOMATIONS-MODULE-REPORT.md</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

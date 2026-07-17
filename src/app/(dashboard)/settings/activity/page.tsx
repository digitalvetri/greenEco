import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listAuditLog } from "@/server/services/user-admin";
import { PageHeader } from "@/components/ui/stat";
import { ActivityLogList } from "./activity-log-list";

export const dynamic = "force-dynamic";

/**
 * Admin-gated (not truly "MD-only" — there's no finer per-job-title permission
 * layer yet; any ADMIN-tier user sees this, same as the rest of Settings).
 */
export default async function ActivityLogPage() {
  const session = await getSession();
  if (session.role !== "ADMIN") notFound();

  const initial = await listAuditLog(session, {});

  return (
    <div>
      <PageHeader title="Activity log" subtitle="Every mutation and sign-in across the workspace, newest first" />
      <ActivityLogList initialItems={initial.items} initialCursor={initial.nextCursor} />
    </div>
  );
}

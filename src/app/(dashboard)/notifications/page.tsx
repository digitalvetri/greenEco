import { getSession } from "@/lib/auth";
import { listNotifications } from "@/server/services/notifications";
import { PageHeader } from "@/components/ui/stat";
import { NotificationsList } from "./notifications-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSession();
  const initial = await listNotifications(session, {});

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Things needing your attention, across every module" />
      <NotificationsList initialItems={initial.items} initialCursor={initial.nextCursor} />
    </div>
  );
}

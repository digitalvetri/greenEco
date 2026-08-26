import { redirect } from "next/navigation";

/**
 * The calendar is now a view inside the Follow-ups module rather than a page of its
 * own — it was never in the sidebar and nothing linked to it, so it was unreachable.
 * Kept as a redirect so any bookmark still lands somewhere useful.
 */
export default async function LegacyCalendarRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const q = new URLSearchParams({ ...params, view: "calendar" }).toString();
  redirect(`/follow-ups?${q}`);
}

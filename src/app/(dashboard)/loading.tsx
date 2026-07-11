import { SkeletonStats, SkeletonRows } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="gc-animate-in">
      <div className="mb-6 space-y-2">
        <div className="gc-skeleton h-7 w-48" />
        <div className="gc-skeleton h-4 w-72" />
      </div>
      <SkeletonStats count={8} />
      <div className="mt-4">
        <SkeletonRows rows={4} />
      </div>
    </div>
  );
}

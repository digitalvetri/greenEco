import { SkeletonStats, SkeletonRows } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <div className="gc-skeleton h-7 w-32" />
        <div className="gc-skeleton h-4 w-56" />
      </div>
      <SkeletonStats count={3} />
      <div className="mt-4"><SkeletonRows rows={5} /></div>
    </div>
  );
}

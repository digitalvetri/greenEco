import { SkeletonStats, SkeletonRows } from "@/components/ui/skeleton";

export default function LeadsLoading() {
  return (
    <div className="gc-animate-in">
      <div className="mb-6 space-y-2">
        <div className="gc-skeleton h-7 w-32" />
        <div className="gc-skeleton h-4 w-64" />
      </div>
      <SkeletonStats count={4} />
      <SkeletonRows rows={8} className="mt-4" />
    </div>
  );
}

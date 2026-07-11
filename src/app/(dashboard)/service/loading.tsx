import { SkeletonStats, SkeletonRows } from "@/components/ui/skeleton";

export default function ServiceLoading() {
  return (
    <div className="gc-animate-in">
      <div className="mb-6 space-y-2">
        <div className="gc-skeleton h-7 w-48" />
        <div className="gc-skeleton h-4 w-80" />
      </div>
      <SkeletonStats count={4} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SkeletonRows rows={5} />
        <SkeletonRows rows={5} />
      </div>
    </div>
  );
}

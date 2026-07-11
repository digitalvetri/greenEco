import { SkeletonStats, SkeletonRows } from "@/components/ui/skeleton";

export default function MaterialsLoading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <div className="gc-skeleton h-7 w-40" />
        <div className="gc-skeleton h-4 w-64" />
      </div>
      <SkeletonStats count={4} />
      <div className="mt-4">
        <SkeletonRows rows={6} />
      </div>
    </div>
  );
}

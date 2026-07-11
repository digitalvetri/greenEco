import { SkeletonStats, SkeletonRows } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <div className="gc-skeleton h-7 w-32" />
        <div className="gc-skeleton h-4 w-48" />
      </div>
      <SkeletonStats count={3} />
      <div className="mt-4"><SkeletonRows rows={6} /></div>
    </div>
  );
}

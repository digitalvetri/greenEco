import { SkeletonStats, SkeletonRows } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="gc-animate-in">
      <div className="mb-6 space-y-2">
        <div className="gc-skeleton h-7 w-36" />
        <div className="gc-skeleton h-4 w-64" />
      </div>
      <SkeletonStats count={4} />
      <SkeletonRows rows={6} className="mt-4" />
    </div>
  );
}

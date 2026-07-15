import { SkeletonRows } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <div className="gc-skeleton h-7 w-48" />
        <div className="gc-skeleton h-4 w-72" />
      </div>
      <div className="mb-4 flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="gc-skeleton h-9 w-28 rounded-lg" />
        ))}
      </div>
      <SkeletonRows rows={5} />
    </div>
  );
}

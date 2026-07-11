import Link from "next/link";
import { Leaf } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Leaf className="size-6" />
      </span>
      <h1 className="text-3xl font-bold tracking-tight">404</h1>
      <p className="mt-1 text-sm text-muted">This page could not be found.</p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:brightness-110"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

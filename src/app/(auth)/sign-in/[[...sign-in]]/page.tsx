import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { Droplets } from "lucide-react";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Clerk-hosted sign-in. In dev-shim mode there is no login — go straight in. */
export default function SignInPage() {
  if (env.authMode !== "clerk") redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Droplets className="size-5" />
          </span>
          <div className="leading-tight">
            <div className="text-lg font-bold tracking-tight">GreenEco CRM</div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-muted">Wastewater Ops</div>
          </div>
        </div>
        <div className="flex justify-center">
          <SignIn />
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Access is provisioned by your administrator.
        </p>
      </div>
    </div>
  );
}

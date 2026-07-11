"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/(auth)/sign-in/actions";

/** Sign-out button — clears the session cookie and returns to /sign-in. */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className="flex size-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        <LogOut className="size-4" />
      </button>
    </form>
  );
}

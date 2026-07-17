"use server";

import { ZodError } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { updateProfile, changePassword, updateAvatar } from "@/server/services/profile";
import { adminResetPassword, createUser, setUserJobTitle, type CreateUserInput } from "@/server/services/user-admin";
import type { JobTitle } from "@prisma/client";
import {
  updateCompanyDetails,
  updateThresholds,
  type CompanyDetailsInput,
  type ThresholdsInput,
} from "@/server/services/company-settings";

export interface ActionState {
  ok?: boolean;
  message?: string;
  error?: string;
}

function toMessage(e: unknown): string {
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Invalid input";
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  try {
    await updateProfile(session, {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    });
    revalidatePath("/settings");
    return { ok: true, message: "Profile updated" };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function updateAvatarAction(url: string | null) {
  const session = await getSession();
  const res = await updateAvatar(session, url);
  revalidatePath("/", "layout"); // sidebar/mobile-nav render the avatar on every page
  return res;
}

export async function adminResetPasswordAction(userId: string, newPassword: string) {
  const session = await getSession();
  return adminResetPassword(session, userId, newPassword);
}

export async function createUserAction(input: CreateUserInput): Promise<ActionState & { id?: string }> {
  const session = await getSession();
  try {
    const { id } = await createUser(session, input);
    revalidatePath("/settings");
    return { ok: true, message: "User created", id };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function setUserJobTitleAction(userId: string, jobTitle: JobTitle | null): Promise<ActionState> {
  const session = await getSession();
  try {
    await setUserJobTitle(session, userId, jobTitle);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function updateCompanyDetailsAction(input: CompanyDetailsInput): Promise<ActionState> {
  const session = await getSession();
  try {
    await updateCompanyDetails(session, input);
    revalidatePath("/settings");
    return { ok: true, message: "Company details saved" };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function updateThresholdsAction(input: ThresholdsInput): Promise<ActionState> {
  const session = await getSession();
  try {
    await updateThresholds(session, input);
    revalidatePath("/settings");
    return { ok: true, message: "Thresholds saved" };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  try {
    await changePassword(session, {
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    });
    return { ok: true, message: "Password changed" };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

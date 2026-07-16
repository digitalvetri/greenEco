"use server";

import { getSession } from "@/lib/auth";
import { askEco, type EcoAnswer, type AskEcoInput } from "@/server/services/eco";

/** Ask Eco a question with optional language, conversation history, and page context. */
export async function askEcoAction(input: AskEcoInput): Promise<EcoAnswer> {
  const session = await getSession().catch(() => null);
  return askEco(input, session ?? undefined);
}

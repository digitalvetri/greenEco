"use server";

import { askEco, type EcoAnswer, type AskEcoInput } from "@/server/services/eco";

/** Ask Eco a question with optional language, conversation history, and page context. */
export async function askEcoAction(input: AskEcoInput): Promise<EcoAnswer> {
  return askEco(input);
}

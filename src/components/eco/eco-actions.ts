"use server";

import { askEco, type EcoAnswer } from "@/server/services/eco";

/** Ask Eco a how-to question (Phase 1 — help content only, no live data). */
export async function askEcoAction(question: string): Promise<EcoAnswer> {
  return askEco(question);
}

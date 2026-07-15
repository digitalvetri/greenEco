import { env } from "@/lib/env";
import { searchHelp, HELP_ARTICLES } from "@/lib/eco-help";

export interface EcoSource {
  title: string;
  href?: string;
}

export interface EcoAnswer {
  answer: string;
  sources: EcoSource[];
  usedAi: boolean;
}

const GREETING =
  "Hi, I'm Eco 🌿 — your in-app helper. Ask me how to do things in the app, like \"how do I create an invoice?\", \"where are my follow-ups?\", or \"how do I edit client details?\".";

/**
 * Eco — Phase 1: answers how-to questions from the written help knowledge base.
 * Deterministic keyword retrieval always runs (works with no AI key). When an
 * Anthropic key is configured, Claude rephrases a natural answer that is STRICTLY
 * grounded in the retrieved help articles — it is never given live business data,
 * so it cannot leak anything (Phase 2 will add role-scoped live answers separately).
 */
export async function askEco(question: string): Promise<EcoAnswer> {
  const q = question.trim();
  if (!q) {
    return { answer: GREETING, sources: [], usedAi: false };
  }

  const matches = searchHelp(q, 3);

  if (matches.length === 0) {
    const topics = HELP_ARTICLES.slice(0, 6).map((a) => `• ${a.title}`).join("\n");
    return {
      answer:
        "I couldn't find help on that yet. I can help with using the app — for example:\n\n" +
        topics +
        "\n\nTry rephrasing, or ask about one of those.",
      sources: [],
      usedAi: false,
    };
  }

  const sources: EcoSource[] = matches.map((m) => ({ title: m.article.title, href: m.article.href }));

  // Without an AI key, return the best-matching article directly (still helpful).
  if (!env.anthropicApiKey) {
    const best = matches[0].article;
    const extra = matches.slice(1).filter((m) => m.score >= matches[0].score * 0.6);
    const more = extra.length ? "\n\nRelated: " + extra.map((m) => m.article.title).join(", ") + "." : "";
    return { answer: best.body + more, sources, usedAi: false };
  }

  try {
    const answer = await claudeAnswer(q, matches.map((m) => m.article));
    return { answer, sources, usedAi: true };
  } catch {
    // AI failed → fall back to the retrieved article so the user still gets help.
    return { answer: matches[0].article.body, sources, usedAi: false };
  }
}

async function claudeAnswer(
  question: string,
  articles: { title: string; body: string }[],
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const context = articles.map((a, i) => `[${i + 1}] ${a.title}\n${a.body}`).join("\n\n");
  const system =
    "You are Eco, the in-app help assistant for the Green Ecocare CRM (a wastewater treatment " +
    "plant project & lead management app). Answer the user's how-to question ONLY using the HELP " +
    "CONTENT provided. Be concise, friendly and practical — give the steps. If the help content " +
    "does not cover the question, say you can only help with using the app and suggest a related " +
    "topic from the content. Never invent features, and never claim to show live data or numbers.";
  const user = `HELP CONTENT:\n${context}\n\nUSER QUESTION: ${question}`;

  const res = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = res.content
    .map((b) => ("text" in b ? b.text : ""))
    .join("")
    .trim();
  return text || articles[0].body;
}

import { llmText, configuredTextProviders } from "@/lib/llm";
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

export interface AskEcoInput {
  question: string;
  lang?: "en" | "ta";
  history?: { role: "user" | "eco"; text: string }[];
  page?: string;
}

const GREETING_EN =
  "Hi, I'm Eco 🌿 — your AI assistant for Green Ecocare CRM. Ask me how to do things in the app — like 'how do I create an invoice?', 'where are my follow-ups?', or 'how do I add a lead?'. I also speak Tamil — just ask!";

const GREETING_TA =
  "வணக்கம்! நான் Eco 🌿 — Green Ecocare CRM AI உதவியாளர். Invoice உருவாக்குவது, Lead சேர்ப்பது, Follow-ups பார்ப்பது போன்ற கேள்விகள் கேளுங்கள்.";

function hasTamilScript(s: string): boolean {
  return /[஀-௿]/.test(s);
}

/** Page path → human-readable context label. */
function pageLabel(path: string): string {
  const map: Record<string, string> = {
    "/dashboard": "the Dashboard",
    "/leads/new": "the New Lead form",
    "/leads": "the Leads list",
    "/proposals": "the Proposals list",
    "/projects": "the Projects list",
    "/invoices": "the Invoices list",
    "/materials/purchasing": "the Materials Purchasing page",
    "/materials/operations": "the Materials Operations page",
    "/materials/requests": "the Material Requests page",
    "/materials": "the Materials / Stock page",
    "/service": "the Service / AMC page",
    "/erection": "the Erection page",
    "/clients": "the Clients list",
    "/reports": "the Reports page",
    "/settings/integrations": "the Settings Integrations page",
    "/settings": "the Settings page",
  };
  for (const [prefix, label] of Object.entries(map)) {
    if (path.startsWith(prefix)) return label;
  }
  return "the app";
}

/**
 * Eco — multilingual AI assistant (English + Tamil).
 *
 * Works with any configured AI provider (Groq, Gemini, or Anthropic) via llmText,
 * which picks whichever key is set — Groq is tried first (fastest/cheapest).
 *
 * Strategy:
 * 1. English questions → keyword retrieval finds top articles → AI answers in English.
 * 2. Tamil questions → skip keyword retrieval → AI answers from full KB in Tamil.
 *    Translation happens at runtime; knowledge base stays English-only.
 * 3. No AI key → keyword retrieval in English; Tamil questions get English fallback.
 */
export async function askEco(input: AskEcoInput): Promise<EcoAnswer> {
  const { question, lang = "en", history = [], page = "/" } = input;
  const q = question.trim();

  if (!q) {
    return {
      answer: lang === "ta" ? GREETING_TA : GREETING_EN,
      sources: [],
      usedAi: false,
    };
  }

  const respondInTamil = lang === "ta" || hasTamilScript(q);

  // Tamil questions skip keyword retrieval (articles are English-only).
  const matches = respondInTamil ? [] : searchHelp(q, 3);
  const sources: EcoSource[] = matches.map((m) => ({
    title: m.article.title,
    href: m.article.href,
  }));

  // Check if any AI provider is configured (Groq, Gemini, or Anthropic).
  const providers = await configuredTextProviders();
  const hasAi = providers.length > 0;

  // ── No AI key path ────────────────────────────────────────────────────────
  if (!hasAi) {
    if (respondInTamil) {
      const englishMatches = searchHelp(q, 1);
      const body = englishMatches[0]?.article.body;
      return {
        answer: body
          ? `(Tamil translation requires an AI key. Please add a Groq or Gemini key in Settings → Integrations.)\n\n${body}`
          : "Tamil responses require an AI key. Please ask your administrator to add a Groq or Gemini API key in Settings → Integrations.",
        sources: englishMatches.map((m) => ({ title: m.article.title, href: m.article.href })),
        usedAi: false,
      };
    }

    if (matches.length === 0) {
      const topics = HELP_ARTICLES.slice(0, 6).map((a) => `• ${a.title}`).join("\n");
      return {
        answer:
          "I couldn't find help on that. I can help with:\n\n" +
          topics +
          "\n\nTry rephrasing, or ask about one of those.",
        sources: [],
        usedAi: false,
      };
    }

    const best = matches[0].article;
    const extra = matches.slice(1).filter((m) => m.score >= matches[0].score * 0.6);
    const more = extra.length
      ? "\n\nRelated: " + extra.map((m) => m.article.title).join(", ") + "."
      : "";
    return { answer: best.body + more, sources, usedAi: false };
  }

  // ── AI path ───────────────────────────────────────────────────────────────
  try {
    const answer = await aiAnswer(q, matches, {
      lang: respondInTamil ? "ta" : "en",
      history,
      page,
    });
    return { answer: answer ?? matches[0]?.article.body ?? "", sources, usedAi: true };
  } catch {
    const fallback = matches[0]?.article.body;
    return {
      answer: fallback ?? "Sorry, I couldn't find an answer. Please try again.",
      sources,
      usedAi: false,
    };
  }
}

async function aiAnswer(
  question: string,
  matches: { article: { title: string; body: string; href?: string } }[],
  opts: { lang: "en" | "ta"; history: { role: "user" | "eco"; text: string }[]; page: string },
): Promise<string | null> {
  const isTamil = opts.lang === "ta";

  // English: use top matched articles. Tamil: use full KB (no keyword match available).
  const articles =
    matches.length > 0 ? matches.map((m) => m.article) : HELP_ARTICLES.slice(0, 10);

  const context = articles.map((a, i) => `[${i + 1}] ${a.title}\n${a.body}`).join("\n\n");

  const langInstruction = isTamil
    ? "LANGUAGE: Respond entirely in natural, fluent Tamil (தமிழ்). Keep technical app terms " +
      "in English (Invoice, Lead, Proposal, Dashboard, BOQ, PO, GRN, AMC, KLD, etc.) but " +
      "write all explanations in Tamil. Use simple everyday Tamil — not formal or archaic language."
    : "LANGUAGE: Respond in clear, friendly English.";

  const system =
    "You are Eco, the AI assistant for Green Ecocare CRM — a wastewater treatment plant " +
    "project and lead management app built by DigitalVetri.AI for Green Ecocare Pvt Ltd.\n\n" +
    "APP MODULES: Leads (enquiries & follow-ups), Proposals (quotes & BOQ), Projects/Orders " +
    "(stage tracking, milestones, invoices), Materials/Inventory (stock, POs, GRN), " +
    "Service/AMC (maintenance contracts, visits, tickets), Erection (site expenses, budget vs actual), " +
    "Clients (360° view), Reports (receivables, GST filing), Settings (company, thresholds, integrations).\n\n" +
    "ROLES: Admin sees everything including prices and budgets. Employee (field staff) sees only " +
    "their own leads and assigned projects — never purchase prices, cost estimates, or budgets.\n\n" +
    `CURRENT PAGE: User is on ${pageLabel(opts.page)}.\n\n` +
    "RULES: Answer using ONLY the help content provided. Be concise and practical — use numbered " +
    "steps where helpful. Never invent features. Never show live data or numbers. If the question " +
    "is completely off-topic (not about the CRM app), politely redirect.\n\n" +
    langInstruction;

  // Flatten conversation history into the user message so it works with all providers.
  const historyText =
    opts.history.length > 0
      ? "PREVIOUS CONVERSATION:\n" +
        opts.history.map((h) => `${h.role === "user" ? "User" : "Eco"}: ${h.text}`).join("\n") +
        "\n\n"
      : "";

  const user = `${historyText}HELP CONTENT:\n${context}\n\nUSER QUESTION: ${question}`;

  // Prefer Sarvam for Tamil (Indian-language specialist); Groq for English (fastest).
  // llmText falls back through the provider list if the preferred one has no key.
  const prefer = isTamil ? "sarvam" : "groq";
  const result = await llmText(system, user, { maxTokens: 700, prefer });
  return result?.text ?? null;
}

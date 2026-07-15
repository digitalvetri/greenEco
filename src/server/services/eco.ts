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
 * Strategy:
 * 1. English questions → keyword retrieval finds top articles → Claude answers in English.
 * 2. Tamil questions → skip keyword retrieval (English-only scorer) → send full knowledge
 *    base to Claude → Claude answers in Tamil. No duplicate Tamil content required.
 * 3. No AI key → keyword retrieval in English; Tamil questions get English fallback text.
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

  const questionIsInTamil = hasTamilScript(q);
  const respondInTamil = lang === "ta" || questionIsInTamil;

  // For Tamil questions, keyword retrieval won't help (articles are English-only),
  // so skip it and let Claude answer from the full knowledge base.
  const matches = respondInTamil ? [] : searchHelp(q, 3);
  const sources: EcoSource[] = matches.map((m) => ({
    title: m.article.title,
    href: m.article.href,
  }));

  // ── No AI key path ────────────────────────────────────────────────────────
  if (!env.anthropicApiKey) {
    if (respondInTamil) {
      // Can't translate without AI — return the best English guess, noting the limitation.
      const englishMatches = searchHelp(q, 1);
      const body = englishMatches[0]?.article.body;
      return {
        answer: body
          ? `(Tamil translation requires an AI key to be configured.)\n\n${body}`
          : "Tamil responses require an AI key. Please ask your administrator to add an AI API key in Settings → Integrations.",
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
    const answer = await claudeAnswer(q, matches, {
      lang: respondInTamil ? "ta" : "en",
      history,
      page,
    });
    return { answer, sources, usedAi: true };
  } catch {
    // AI failed → fall back to English retrieval so the user still gets help.
    const fallback = matches[0]?.article.body;
    return {
      answer: fallback ?? "Sorry, I couldn't find an answer. Please try again.",
      sources,
      usedAi: false,
    };
  }
}

async function claudeAnswer(
  question: string,
  matches: { article: { title: string; body: string; href?: string } }[],
  opts: { lang: "en" | "ta"; history: { role: "user" | "eco"; text: string }[]; page: string },
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const isTamil = opts.lang === "ta";

  // For English questions: use the top matched articles.
  // For Tamil questions: use all articles so Claude has the full picture to translate from.
  const articles =
    matches.length > 0
      ? matches.map((m) => m.article)
      : HELP_ARTICLES.slice(0, 10); // Tamil path — broad context

  const context = articles
    .map((a, i) => `[${i + 1}] ${a.title}\n${a.body}`)
    .join("\n\n");

  const langInstruction = isTamil
    ? "LANGUAGE: Respond entirely in natural, fluent Tamil (தமிழ்). " +
      "Keep technical app terms in English (Invoice, Lead, Proposal, Dashboard, BOQ, " +
      "PO, GRN, AMC, KLD, etc.) but write all explanations in Tamil. " +
      "Use simple everyday Tamil — not formal or archaic language."
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

  type MsgParam = { role: "user" | "assistant"; content: string };
  const historyMessages: MsgParam[] = opts.history.map((h) => ({
    role: h.role === "user" ? "user" as const : "assistant" as const,
    content: h.text,
  }));

  const userContent = `HELP CONTENT:\n${context}\n\nUSER QUESTION: ${question}`;

  const messages: MsgParam[] = [
    ...historyMessages,
    { role: "user" as const, content: userContent },
  ];

  const res = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: 700,
    system,
    messages,
  });

  const text = res.content
    .map((b) => ("text" in b ? b.text : ""))
    .join("")
    .trim();

  return text || articles[0]?.body || "";
}

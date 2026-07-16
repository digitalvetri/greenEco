import { llmText, configuredTextProviders } from "@/lib/llm";
import { searchHelp, HELP_ARTICLES } from "@/lib/eco-help";
import { prisma } from "@/lib/prisma";

type SessionCtx = { userId: string; role: string; companyId: string };

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
  "Hi, I'm Eco 🌿 — your CRM Copilot for Green Ecocare CRM.\n\nAsk me anything about your leads, projects, invoices, materials, clients, or how to use this app. I can show you live data from your CRM!\n\nI also speak Tamil — tap the TA button. Voice input available on Chrome!";

const GREETING_TA =
  "வணக்கம்! நான் Eco 🌿 — உங்கள் Green Ecocare CRM Copilot.\n\nLeads, projects, invoices, materials பற்றி எதுவும் கேளுங்கள். உங்கள் CRM-இல் உள்ள live data கொண்டு பதில் சொல்வேன்!\n\nகுரல் மூலமும் கேட்கலாம் — mic பொத்தானை அழுத்துங்கள்!";

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

/** Fetch live CRM data based on question intent. RBAC-scoped. */
async function fetchLiveCrmContext(ctx: SessionCtx, question: string): Promise<string> {
  const { companyId, role } = ctx;
  const isAdmin = role === "ADMIN";
  const parts: string[] = [];
  const q = question.toLowerCase();

  try {
    // Always: overall counts
    const [projectCount, leadCount] = await Promise.all([
      prisma.order.count({ where: { companyId, deletedAt: null } }),
      prisma.lead.count({ where: { companyId, deletedAt: null } }),
    ]);
    parts.push(`CRM SNAPSHOT: ${projectCount} total projects · ${leadCount} total leads`);

    // Projects/Orders
    if (q.match(/project|order|stage|progress|site|work|active|status/)) {
      const orders = await prisma.order.findMany({
        where: { companyId, deletedAt: null, status: { in: ["ACTIVE", "ON_HOLD"] } },
        select: { orderNo: true, clientName: true, status: true, targetDate: true, siteAddress: true },
        take: 8,
        orderBy: { createdAt: "desc" },
      });
      if (orders.length > 0) {
        parts.push(
          "ACTIVE PROJECTS:\n" +
            orders
              .map(
                (o) =>
                  `• ${o.orderNo} | ${o.clientName} | ${o.status}` +
                  (o.targetDate ? ` | Target: ${new Date(o.targetDate).toLocaleDateString("en-IN")}` : "") +
                  (o.siteAddress ? ` | ${o.siteAddress}` : ""),
              )
              .join("\n"),
        );
      }
    }

    // Leads
    if (q.match(/lead|enquiry|enquir|follow.?up|prospect|customer|new client/)) {
      const leads = await prisma.lead.findMany({
        where: { companyId, deletedAt: null, status: { notIn: ["CONVERTED", "LOST"] } },
        select: { customerName: true, status: true, plantType: true, capacityKLD: true, phone: true },
        take: 8,
        orderBy: { updatedAt: "desc" },
      });
      if (leads.length > 0) {
        parts.push(
          "RECENT LEADS:\n" +
            leads
              .map(
                (l) =>
                  `• ${l.customerName} | ${l.status}` +
                  (l.plantType ? ` | ${l.plantType}` : "") +
                  (l.capacityKLD ? ` ${l.capacityKLD} KLD` : ""),
              )
              .join("\n"),
        );
      }
    }

    // Invoices & payments
    if (q.match(/invoice|payment|receipt|outstanding|receivable|due|paid|money|amount/)) {
      const [invoiceStats, recentInvoices] = await Promise.all([
        prisma.invoice.aggregate({
          where: { companyId, isCreditNote: false, status: "ISSUED" },
          _count: { id: true },
          _sum: { total: true },
        }),
        prisma.invoice.findMany({
          where: { companyId, isCreditNote: false },
          select: { invoiceNo: true, total: true, status: true, date: true },
          take: 5,
          orderBy: { date: "desc" },
        }),
      ]);
      if (isAdmin && invoiceStats._count.id > 0) {
        const total = invoiceStats._sum.total ? Number(invoiceStats._sum.total).toLocaleString("en-IN") : "0";
        parts.push(`INVOICE SUMMARY: ${invoiceStats._count.id} issued invoices · Total ₹${total}`);
      }
      if (recentInvoices.length > 0) {
        parts.push(
          "RECENT INVOICES:\n" +
            recentInvoices
              .map(
                (i) =>
                  `• ${i.invoiceNo} | ₹${Number(i.total).toLocaleString("en-IN")} | ${i.status} | ${new Date(i.date).toLocaleDateString("en-IN")}`,
              )
              .join("\n"),
        );
      }
    }

    // Materials & stock
    if (q.match(/material|stock|item|inventory|quantity|low.?stock/)) {
      const items = await prisma.item.findMany({
        where: { companyId },
        select: { name: true, category: true, unit: true },
        take: 10,
        orderBy: { name: "asc" },
      });
      if (items.length > 0) {
        parts.push(
          `STOCK ITEMS (${items.length} total):\n` +
            items.map((i) => `• ${i.name} (${i.category}) — unit: ${i.unit}`).join("\n"),
        );
      }
    }

    // Vendors (admin only)
    if (isAdmin && q.match(/vendor|supplier|purchase order|po\b/)) {
      const vendors = await prisma.vendor.findMany({
        where: { companyId },
        select: { name: true, phone: true, categories: true },
        take: 8,
        orderBy: { name: "asc" },
      });
      if (vendors.length > 0) {
        parts.push(
          "VENDORS:\n" +
            vendors
              .map((v) => `• ${v.name} | ${v.phone} | ${v.categories.join(", ")}`)
              .join("\n"),
        );
      }
    }

    // Clients
    if (q.match(/client|customer|who.*(work|project|order)/)) {
      const clients = await prisma.order.groupBy({
        by: ["clientName"],
        where: { companyId, deletedAt: null },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 8,
      });
      if (clients.length > 0) {
        parts.push(
          "CLIENTS:\n" +
            clients
              .map((c) => `• ${c.clientName} — ${c._count.id} project${c._count.id > 1 ? "s" : ""}`)
              .join("\n"),
        );
      }
    }
  } catch {
    // DB error → skip live data, AI still uses help articles
  }

  return parts.join("\n\n");
}

/**
 * Eco — CRM Copilot for Green Ecocare CRM.
 *
 * Answers questions using BOTH live CRM data (when session is available) AND
 * help articles from the knowledge base. Supports English + Tamil with bilingual
 * responses. Uses Groq as the primary AI (fast, reliable, handles Tamil well).
 */
export async function askEco(input: AskEcoInput, ctx?: SessionCtx): Promise<EcoAnswer> {
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

  // English questions → keyword search; Tamil questions skip keyword search (KB is English-only)
  const matches = respondInTamil ? [] : searchHelp(q, 3);
  const sources: EcoSource[] = matches.map((m) => ({
    title: m.article.title,
    href: m.article.href,
  }));

  // Fetch live CRM context (if authenticated)
  const liveContext = ctx ? await fetchLiveCrmContext(ctx, q) : "";

  // Check if any AI provider is configured
  const providers = await configuredTextProviders();
  const hasAi = providers.length > 0;

  // ── No AI key path ────────────────────────────────────────────────────────
  if (!hasAi) {
    if (respondInTamil) {
      return {
        answer:
          "Tamil பதில்களுக்கு AI key தேவை. Settings → Integrations-ல் Groq API key சேர்க்கவும்.\n\n(Tamil responses require a Groq API key. Please add one in Settings → Integrations.)",
        sources: [],
        usedAi: false,
      };
    }

    if (liveContext) {
      return {
        answer:
          "Here's what I found in your CRM:\n\n" +
          liveContext +
          "\n\nFor detailed analysis and AI-powered answers, add a Groq API key in Settings → Integrations.",
        sources,
        usedAi: false,
      };
    }

    if (matches.length === 0) {
      return {
        answer:
          "I couldn't find help on that. Try asking about: leads, proposals, projects, invoices, materials, service/AMC, or erection. Add a Groq API key in Settings → Integrations for AI-powered answers.",
        sources: [],
        usedAi: false,
      };
    }

    const best = matches[0].article;
    const extra = matches.slice(1).filter((m) => m.score >= matches[0].score * 0.6);
    const more = extra.length ? "\n\nRelated: " + extra.map((m) => m.article.title).join(", ") + "." : "";
    return { answer: best.body + more, sources, usedAi: false };
  }

  // ── AI path ───────────────────────────────────────────────────────────────
  try {
    const answer = await aiAnswer(q, matches, liveContext, {
      lang: respondInTamil ? "ta" : "en",
      history,
      page,
      isAdmin: ctx?.role === "ADMIN",
    });
    return { answer: answer ?? (matches[0]?.article.body ?? ""), sources, usedAi: true };
  } catch {
    const fallback = liveContext
      ? (respondInTamil
          ? "உங்கள் CRM data:\n\n" + liveContext
          : "Here's what I found in your CRM:\n\n" + liveContext)
      : (matches[0]?.article.body ?? "Sorry, I couldn't find an answer. Please try again.");
    return { answer: fallback, sources, usedAi: false };
  }
}

async function aiAnswer(
  question: string,
  matches: { article: { title: string; body: string; href?: string } }[],
  liveContext: string,
  opts: { lang: "en" | "ta"; history: { role: "user" | "eco"; text: string }[]; page: string; isAdmin: boolean },
): Promise<string | null> {
  const isTamil = opts.lang === "ta";

  // Build knowledge context: matched help articles (or full KB for Tamil)
  const articles = matches.length > 0 ? matches.map((m) => m.article) : HELP_ARTICLES.slice(0, 8);
  const helpContext = articles.map((a, i) => `[${i + 1}] ${a.title}\n${a.body}`).join("\n\n");

  const langInstruction = isTamil
    ? "LANGUAGE RULE: Respond in BOTH Tamil and English.\n" +
      "1. Start with a complete answer in Tamil (தமிழ்). Keep technical terms in English (Invoice, Lead, Proposal, BOQ, PO, GRN, AMC, KLD, etc.) but all explanations in Tamil.\n" +
      "2. Then write '---' on a new line.\n" +
      "3. Then write '🇬🇧 English:' followed by the same answer in English.\n" +
      "Use simple, everyday Tamil — not formal or archaic language."
    : "LANGUAGE: Respond in clear, friendly English.";

  const liveDataSection = liveContext
    ? `\n\nLIVE CRM DATA (from the database right now):\n${liveContext}\n\nUse this live data to give specific, accurate answers about the user's actual business.`
    : "";

  const system =
    "You are Eco 🌿, the CRM Copilot for Green Ecocare CRM — a wastewater treatment plant " +
    "project management app built by DigitalVetri.AI for Green Ecocare Pvt Ltd, India.\n\n" +
    "APP MODULES: Leads (enquiries & follow-ups), Proposals (quotes & BOQ), Projects/Orders " +
    "(stage tracking, milestones, invoices), Materials/Inventory (stock, POs, GRN), " +
    "Service/AMC (maintenance contracts, visits, tickets), Erection (site expenses, budget vs actual), " +
    "Clients (360° view), Reports (receivables, GST filing), Settings (company, thresholds, integrations).\n\n" +
    "ROLES: Admin sees everything including prices and budgets. Employee (field staff) sees only " +
    "their own leads and assigned projects — never purchase prices, cost estimates, or budgets.\n\n" +
    `CURRENT PAGE: User is on ${pageLabel(opts.page)}.\n` +
    `USER ROLE: ${opts.isAdmin ? "ADMIN (can see all data including prices)" : "EMPLOYEE (no pricing data)"}\n` +
    liveDataSection +
    "\n\nRULES:\n" +
    "1. If live CRM data is provided, USE IT to answer specific questions (e.g., 'how many projects?', 'which leads are pending?').\n" +
    "2. Use help articles for guidance on HOW TO USE the app.\n" +
    "3. Be concise and actionable. Use bullet points where helpful.\n" +
    "4. If asked about something not in the data, say so honestly.\n" +
    "5. Never invent data. Never show prices/costs to non-admin users.\n\n" +
    langInstruction;

  // Flatten conversation history
  const historyText =
    opts.history.length > 0
      ? "PREVIOUS CONVERSATION:\n" +
        opts.history.map((h) => `${h.role === "user" ? "User" : "Eco"}: ${h.text}`).join("\n") +
        "\n\n"
      : "";

  const user = `${historyText}HELP ARTICLES:\n${helpContext}\n\nUSER QUESTION: ${question}`;

  // Always prefer Groq (fast, reliable, handles Tamil well via multilingual Llama 3.3)
  // Fall back through the provider chain if Groq isn't configured
  const result = await llmText(system, user, { maxTokens: 900, prefer: "groq" });
  return result?.text ?? null;
}

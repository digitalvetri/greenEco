/**
 * Eco chatbot — Phase 1 knowledge base.
 *
 * Written help content about *using the app* (not live business data). Answers are
 * retrieved by keyword scoring (deterministic, works with no AI key). Keep articles
 * short, task-focused, and in plain language. Phase 2 (live status queries under the
 * same RBAC rules) builds on top of this — it does NOT replace it.
 */
export interface HelpArticle {
  id: string;
  title: string;
  /** Extra terms (synonyms) that should match this article beyond title/body words. */
  keywords: string[];
  body: string;
  /** Optional in-app link the UI can offer as a shortcut. */
  href?: string;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "create-lead",
    title: "Add a new lead / enquiry",
    keywords: ["lead", "enquiry", "inquiry", "customer", "new lead", "add lead", "prospect", "existing customer"],
    href: "/leads/new",
    body:
      "Go to Leads → New Lead. Choose 'Add New Customer' to type a fresh enquiry, or 'Search Existing Customer' to reuse a past customer's name, contact and address (they auto-fill and stay editable). Fill in the requirement and plant sizing, then Save Lead — or use 'Save & start proposal' to jump straight into a quote.",
  },
  {
    id: "follow-ups",
    title: "See and manage follow-ups",
    keywords: ["follow up", "follow-up", "followup", "reminder", "due", "overdue", "next action", "calendar", "tasks"],
    href: "/follow-ups",
    body:
      "Open Follow-ups (in the Sales menu, or click the calendar on the Dashboard). It lists every scheduled next-action across your open leads, grouped into Overdue, Due today and Upcoming. Click any row to open that lead and log the outcome. Schedule a new follow-up from a lead's detail page.",
  },
  {
    id: "convert-proposal",
    title: "Turn a lead into a proposal / quote",
    keywords: ["proposal", "quote", "quotation", "convert", "estimate", "boq", "pricing"],
    href: "/proposals",
    body:
      "Open the lead and click 'Convert to Proposal' (or use 'Save & start proposal' on the new-lead form). This creates a draft quote with an indicative BOQ you can edit. Adjust the items, margin, payment terms and validity, then send it to the customer.",
  },
  {
    id: "proposal-status",
    title: "Understand a proposal's stage",
    keywords: ["proposal status", "stage", "negotiation", "won", "lost", "expired", "process flow", "tracker"],
    href: "/proposals",
    body:
      "Each proposal shows a simple stage tracker: Preparing quote → Sent to customer → In discussion → Approved. If a quote doesn't go ahead it shows 'Not proceeding' (lost) or 'Quote expired'. Use the buttons on the proposal to move it to negotiation, mark it won/lost, or reopen it.",
  },
  {
    id: "won-order",
    title: "Mark a proposal Won and start the project",
    keywords: ["won", "win", "order", "project", "start project", "approve proposal"],
    href: "/projects",
    body:
      "An admin approves the proposal (margin is checked) and marks it Won. That creates the project/order with its stages, payment milestones and a site location. Projects are only created from an approved, Won proposal — this keeps scope and price agreed before work starts.",
  },
  {
    id: "edit-client",
    title: "Edit client details",
    keywords: ["edit client", "client details", "update client", "change phone", "change address", "contacts", "client 360"],
    href: "/clients",
    body:
      "Open the client from Clients (Client 360) and click Edit on the Identity card. You can change name, phone, email, address and source, and add or remove contacts. Changes are saved and reflected across the app.",
  },
  {
    id: "edit-project",
    title: "Change project dates or value",
    keywords: ["project value", "reschedule", "start date", "target date", "budget", "estimated value", "schedule"],
    href: "/projects",
    body:
      "On the project's Overview tab, use 'Reschedule' to change the start and target-completion dates. Use the pencil on Project Value to revise the estimated value — a reason is required and is logged. These are admin actions.",
  },
  {
    id: "invoices",
    title: "Create, view and issue an invoice",
    keywords: ["invoice", "bill", "gst invoice", "tax invoice", "issue", "create invoice", "print invoice", "pdf"],
    href: "/invoices",
    body:
      "Invoices are raised from a project's payment milestones — open the project, find the milestone and click 'Invoice'. The invoice slides in as a panel where you can review it and Issue it (which assigns the permanent number). From the Invoices list, click any invoice to open the same panel to view, print or download the PDF.",
  },
  {
    id: "record-payment",
    title: "Record a payment received",
    keywords: ["payment", "receipt", "collected", "money received", "record payment", "milestone"],
    href: "/projects",
    body:
      "Open the project and go to the milestone. Click 'Receipt', enter the amount and payment mode, and record it. The milestone status and receivables update automatically. Receipts are a permanent ledger — correct mistakes with a reversal, not by deleting.",
  },
  {
    id: "materials-vendors",
    title: "Find materials and vendors",
    keywords: ["material", "stock", "inventory", "vendor", "supplier", "pumps", "reorder", "low stock", "item"],
    href: "/materials",
    body:
      "Materials shows the item master with stock by location. Pick a category tab (e.g. Pumps & Motors) to filter items and see the vendors that supply that category in the Vendors section. Admins can add items, vendors and purchase orders from the same page.",
  },
  {
    id: "settings-thresholds",
    title: "Change company details or thresholds",
    keywords: ["settings", "company", "gstin", "prefix", "margin", "auto approve", "budget alert", "threshold", "logo"],
    href: "/settings",
    body:
      "Admins can open Settings to edit Company details (name, GSTIN, address, document number prefixes, logo) and Thresholds (minimum margin %, auto-approve limit, budget alert %, low-stock multiplier). Threshold changes take effect on the next automation run — no redeploy needed.",
  },
  {
    id: "amc-service",
    title: "Service contracts (AMC) and maintenance",
    keywords: ["amc", "service", "maintenance", "contract", "visit", "ticket", "o&m", "renewal"],
    href: "/service",
    body:
      "Service / AMC tracks post-handover maintenance contracts, their preventive-visit schedule, and service tickets with SLAs. You can renew an expiring contract, log visit readings, and raise AMC invoices from the contract.",
  },
  {
    id: "roles-visibility",
    title: "What can field staff (employees) see?",
    keywords: ["role", "permission", "employee", "admin", "visibility", "who can see", "pricing", "cost", "hidden"],
    body:
      "There are two roles. Admins see everything including cost, margin and purchase prices. Field staff (employees) see their own leads and the projects they're on, but never purchase prices, cost estimates, margins or budgets — those are stripped out on the server, not just hidden in the screen.",
  },
  {
    id: "reports",
    title: "Reports and analytics",
    keywords: ["report", "analytics", "receivables", "gst report", "collection", "dashboard", "kpi"],
    href: "/reports",
    body:
      "Reports (admin) covers receivables, GST filing summary and collections. Each module (Leads, Proposals, Projects, Service, Materials, Erection) also has its own Analytics page with win rates, pipeline value, spend and more.",
  },
  {
    id: "profile-password",
    title: "Update your profile or password",
    keywords: ["profile", "password", "account", "my details", "change password", "name", "phone"],
    href: "/settings",
    body:
      "Open Settings → My Profile to update your name and phone, or change your password (you'll need your current password). This is available to every user for their own account.",
  },
];

const STOP_WORDS = new Set([
  "the", "a", "an", "to", "how", "do", "i", "can", "of", "in", "on", "for", "is", "my",
  "me", "and", "with", "what", "where", "when", "it", "this", "that", "add", "get", "see",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export interface HelpMatch {
  article: HelpArticle;
  score: number;
}

/**
 * Score help articles against a question by keyword overlap (title + keywords weighted
 * higher than body). Pure and deterministic — no network, works with no AI key.
 */
export function searchHelp(question: string, limit = 3): HelpMatch[] {
  const qTokens = tokenize(question);
  if (qTokens.length === 0) return [];
  const qSet = new Set(qTokens);

  const scored = HELP_ARTICLES.map((article) => {
    const titleTokens = new Set(tokenize(article.title));
    const kwTokens = new Set(article.keywords.flatMap(tokenize));
    const bodyTokens = new Set(tokenize(article.body));

    let score = 0;
    for (const t of qSet) {
      if (kwTokens.has(t)) score += 3;
      if (titleTokens.has(t)) score += 2;
      if (bodyTokens.has(t)) score += 1;
    }
    // Phrase bonus: multi-word keyword appearing verbatim in the question.
    const ql = question.toLowerCase();
    for (const kw of article.keywords) {
      if (kw.includes(" ") && ql.includes(kw)) score += 2;
    }
    return { article, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

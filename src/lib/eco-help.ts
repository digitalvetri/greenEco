/**
 * Eco chatbot — English knowledge base.
 *
 * All content is written once in English. Tamil translation happens at runtime
 * via Claude when the user selects Tamil — no duplicate content required here.
 * Answers are retrieved by English keyword scoring (deterministic, works with
 * no AI key). Phase 2 (live status queries) builds on top of this.
 */
export interface HelpArticle {
  id: string;
  title: string;
  /** Extra terms (synonyms) that should match this article beyond title/body words. */
  keywords: string[];
  body: string;
  href?: string;
}

export const HELP_ARTICLES: HelpArticle[] = [
  // ─── LEADS ───────────────────────────────────────────────────────────────
  {
    id: "create-lead",
    title: "Add a new lead / enquiry",
    keywords: [
      "lead", "enquiry", "inquiry", "customer", "new lead", "add lead",
      "prospect", "existing customer", "create lead", "new enquiry",
    ],
    href: "/leads/new",
    body:
      "Go to Leads → New Lead. Fill in Customer Name, Address, Project Name, Project Address, Phone and Source. Add plant sizing details (capacity in KLD, plant type, technology). Then:\n• 'Save Lead' — saves and opens the lead detail.\n• 'Save & start proposal' — saves and immediately opens a draft quote.",
  },
  {
    id: "follow-ups",
    title: "See and manage follow-ups",
    keywords: [
      "follow up", "follow-up", "followup", "reminder", "due", "overdue",
      "next action", "calendar", "tasks", "schedule call", "log call",
    ],
    href: "/leads",
    body:
      "Follow-ups appear on the Lead detail page and on the Dashboard's 'Due Today' tile.\n\nTo log a follow-up: open a lead → click 'Add Follow-up' → choose type (Call, Visit, WhatsApp, Email, Meeting), write notes, pick outcome and next date → Save.\n\nOverdue follow-ups show a red badge. Admins can see all; employees see only their own leads.",
  },
  {
    id: "convert-proposal",
    title: "Turn a lead into a proposal / quote",
    keywords: [
      "proposal", "quote", "quotation", "convert", "estimate", "boq", "pricing",
      "start proposal", "create quote", "new proposal",
    ],
    href: "/proposals",
    body:
      "Open the lead → click 'Convert to Proposal'. This creates a draft proposal with an auto-generated BOQ (bill of quantities) based on the lead's plant sizing.\n\nFrom the Proposal editor you can:\n1. Edit BOQ line items (description, quantity, rate).\n2. Set payment terms (% per milestone) and validity days.\n3. Generate an AI draft of the technical write-up.\n4. Send to the customer and mark Won when accepted.",
  },
  {
    id: "proposal-status",
    title: "Understand a proposal's stage / status",
    keywords: [
      "proposal status", "stage", "negotiation", "won", "lost", "expired",
      "under negotiation", "reopen", "proposal stage", "proposal flow",
    ],
    href: "/proposals",
    body:
      "Proposal stages in order:\n1. DRAFT → 2. SENT → 3. UNDER NEGOTIATION → 4. APPROVED → 5. WON (creates project) or LOST.\n\nAdmin actions:\n• 'Mark Under Negotiation' — price is being discussed.\n• 'Approve & Send' — margin is verified; customer has a copy.\n• 'Mark Won' — creates the project automatically.\n• 'Mark Lost' — requires a reason (feeds win/loss analytics).\n• 'Reopen' — brings a LOST proposal back to SENT.\n\nExpired: if validity days have passed and it's still open, it shows an 'Expiring' badge.",
  },
  {
    id: "won-order",
    title: "Mark a proposal Won and start the project",
    keywords: [
      "won", "win", "order", "project", "start project", "approve proposal",
      "mark won", "create order", "project create",
    ],
    href: "/projects",
    body:
      "Only admins can mark a proposal Won. Steps:\n1. Open the proposal → click 'Mark Won'.\n2. The system creates an Order (project) with the agreed scope, 9 execution stages and payment milestones from the proposal's payment terms.\n3. The project appears in the Projects list immediately.\n\nTip: set the customer's state code on the project Overview for correct GST (CGST+SGST vs IGST).",
  },
  {
    id: "edit-lead",
    title: "Edit a lead",
    keywords: [
      "edit lead", "update lead", "change lead", "lead edit", "modify lead",
    ],
    href: "/leads",
    body:
      "Open the lead → click the 'Edit' button (top right). You can change customer name, address, project name, project address, phone, email, source, plant sizing and notes. After editing, click 'Save changes'.\n\nContacts and reference details are managed separately via the Contacts card on the lead detail page.",
  },
  {
    id: "lead-status",
    title: "Change a lead's status (On Hold, Lost, Reopen)",
    keywords: [
      "lead status", "on hold", "lost", "reopen", "archive", "mark lost",
      "close lead", "reopen lead",
    ],
    href: "/leads",
    body:
      "On the lead detail page, use the status control buttons:\n• 'On Hold' — pauses the lead without losing it.\n• 'Mark Lost' — requires a loss reason (e.g., Budget constraint, Competitor win).\n• 'Reopen' — moves ON_HOLD or LOST back to IN_FOLLOWUP.\n• 'Archive' — admin only, soft-deletes the lead from all lists.\n\nStatus changes are logged in the Activity timeline.",
  },
  // ─── PROPOSALS ───────────────────────────────────────────────────────────
  {
    id: "proposal-editor",
    title: "Edit the proposal / BOQ",
    keywords: [
      "boq", "bill of quantities", "line items", "edit proposal", "add item",
      "remove item", "change price", "payment terms", "validity", "edit boq",
    ],
    href: "/proposals",
    body:
      "Open the proposal → the editor has three sections:\n1. Basics — customer details, title, dates (editable by admin).\n2. BOQ — line items with description, quantity, rate. Click '+ Add Item' to insert a row; click the trash icon to remove. Margin % is shown to admins only.\n3. Payment Terms — add milestones (description, % of total, trigger). Percentages must add up to 100%.\n\nClick 'Save proposal' to save changes. A new version is created automatically when the proposal is already in SENT status.",
  },
  {
    id: "send-proposal",
    title: "Send a proposal to the customer",
    keywords: [
      "send proposal", "share quote", "whatsapp proposal", "email proposal",
      "proposal send", "customer share",
    ],
    href: "/proposals",
    body:
      "From the proposal editor → Activity tab → click 'Send to customer'. Choose WhatsApp or Email. A PDF link is sent to the customer's phone/email registered on the lead.\n\nThe proposal status moves to SENT. A communication record is added to the Activity timeline so you can track when and how it was shared.",
  },
  // ─── PROJECTS / ORDERS ───────────────────────────────────────────────────
  {
    id: "project-stages",
    title: "Update project stage progress",
    keywords: [
      "stage", "progress", "update stage", "complete stage", "delay reason",
      "stage progress", "project update", "execution stage",
    ],
    href: "/projects",
    body:
      "Open the project → Stages tab. Each of the 9 stages has a progress slider (0–100%). Drag or type the percentage.\n\nIf a stage is delayed (progress < 100% past its planned date), you must provide a delay reason before saving. Geo-tagged photos can be attached to any stage update.\n\nCompleted stages (100%) are highlighted in green.",
  },
  {
    id: "milestones-payments",
    title: "Milestone payments and receipts",
    keywords: [
      "milestone", "payment", "receipt", "collected", "money received",
      "milestone payment", "advance payment", "receipt add",
    ],
    href: "/projects",
    body:
      "Open the project → Payments tab. Each milestone shows its amount and status (PENDING/PARTIAL/PAID).\n\nTo record a receipt:\n1. Click 'Receipt' on the milestone.\n2. Enter the amount received and payment mode (bank transfer, cheque, cash, UPI).\n3. Click 'Record Receipt'.\n\nReceipts are permanent ledger entries — correct mistakes by recording a reversal (negative amount), not by deleting.",
  },
  {
    id: "invoices",
    title: "Create, view and issue an invoice",
    keywords: [
      "invoice", "bill", "gst invoice", "tax invoice", "issue", "create invoice",
      "print invoice", "pdf", "new invoice", "standalone invoice",
    ],
    href: "/invoices",
    body:
      "Two ways to create an invoice:\n\n1. From a milestone: open the project → Payments tab → click 'Invoice' on the milestone. Reviews the calculated amount with GST breakdown.\n\n2. Manual: Invoices list → click 'New Invoice' → select the project, enter gross amount and GST rate → creates a DRAFT.\n\nTo issue a draft: open any invoice panel → click 'Issue Invoice'. This assigns the permanent sequential number (GEC-INV-YYYY-NNN). Issued invoices can be downloaded as PDF.",
  },
  // ─── MATERIALS ───────────────────────────────────────────────────────────
  {
    id: "materials-stock",
    title: "Check stock levels and add items",
    keywords: [
      "material", "stock", "inventory", "item", "low stock", "reorder",
      "add item", "stock level", "on hand",
    ],
    href: "/materials",
    body:
      "Materials → Stock shows all items with current on-hand quantity by location. Use the category tabs to filter (Pumps, Pipes, Chemicals, etc.).\n\nTo add an item: click 'Add Item' → enter name, category, unit, reorder point and purchase price (admin only).\n\nLow-stock items are highlighted in yellow. The system sends a WhatsApp alert to admins when stock falls below the reorder level.",
  },
  {
    id: "materials-po",
    title: "Raise a Purchase Order (PO)",
    keywords: [
      "purchase order", "po", "vendor", "order material", "raise po", "create po",
      "grn", "goods received", "material purchase",
    ],
    href: "/materials/purchasing",
    body:
      "Materials → Purchasing → click 'New PO'.\n1. Select vendor, add line items (material, quantity, unit rate).\n2. Save → PO is created with status PENDING.\n3. When goods arrive: open the PO → click 'Record GRN' (Goods Received Note) → enter received qty and GRN number.\n4. Stock is automatically updated. Admin-only: PO rates and vendor prices are never visible to employees.",
  },
  {
    id: "materials-transfer",
    title: "Transfer stock to site or between locations",
    keywords: [
      "transfer", "issue to site", "stock transfer", "move stock", "site issue",
      "material transfer", "location transfer",
    ],
    href: "/materials/operations",
    body:
      "Materials → Operations → Transfer tab.\n1. Select source location (e.g. Main Warehouse).\n2. Select destination (e.g. Site Name).\n3. Choose item and quantity → click 'Transfer'.\n\nStock balances at both locations update immediately. A permanent stock movement record is created — transfers cannot be undone, only corrected with a reverse transfer.",
  },
  {
    id: "material-request",
    title: "Request materials (field staff)",
    keywords: [
      "material request", "request material", "site request", "request stock",
      "field request", "employee request",
    ],
    href: "/materials/requests",
    body:
      "Field staff (employees) can request materials without seeing prices:\n1. Materials → Requests → 'New Request'.\n2. Select the project/order, item and quantity needed.\n3. Submit — the admin sees a notification badge on the Requests tab.\n\nAdmin can then TRANSFER the items to site or create a PO to procure them, and mark the request TRANSFERRED or CONVERTED TO PO.",
  },
  // ─── SERVICE / AMC ────────────────────────────────────────────────────────
  {
    id: "amc-service",
    title: "Service contracts (AMC) and maintenance",
    keywords: [
      "amc", "service", "maintenance", "contract", "visit", "ticket", "o&m",
      "renewal", "service contract", "amc invoice",
    ],
    href: "/service",
    body:
      "Service / AMC covers post-handover maintenance:\n• Contracts: annual or quarterly service agreements with auto-scheduled visits.\n• Visits: capture plant readings (pH, DO, flow), photos and checklist.\n• Tickets: raise and resolve service issues with SLA tracking.\n• Invoices: generate recurring AMC invoices from the contract.\n• Renewal: renew expiring contracts from the contract detail page.\n\nAdmins see the annual contract value; employees see visits and tickets only.",
  },
  // ─── ERECTION ────────────────────────────────────────────────────────────
  {
    id: "erection",
    title: "Erection entries and site expenses",
    keywords: [
      "erection", "site expense", "labour", "site purchase", "bill", "verify",
      "erection entry", "site cost", "budget vs actual",
    ],
    href: "/erection",
    body:
      "Erection tracks all site expenses:\n• Labour — daily worker wages.\n• Site Purchase — materials bought directly on site (requires a photo of the bill).\n• Other — miscellaneous site costs.\n• Consumption — materials consumed from main stock.\n\nField staff submit entries; admins approve, query or reject. The Budget vs Actual panel shows how much of the project budget has been spent + committed.\n\nAutomatic approval: entries below the company's auto-approve limit are approved instantly.",
  },
  // ─── CLIENTS ─────────────────────────────────────────────────────────────
  {
    id: "edit-client",
    title: "Edit client details / Client 360",
    keywords: [
      "edit client", "client details", "update client", "change phone",
      "change address", "contacts", "client 360", "customer details",
    ],
    href: "/clients",
    body:
      "Clients → click the client name → Client 360 opens.\n\nShows all leads, proposals and orders linked to that customer.\n\nTo edit: click 'Edit' on the Identity card → change name, phone, email, address → Save. Contact persons can be added or removed here too.\n\nChanges are reflected across all linked leads and orders.",
  },
  // ─── SETTINGS / ADMIN ────────────────────────────────────────────────────
  {
    id: "settings-thresholds",
    title: "Change company details or thresholds",
    keywords: [
      "settings", "company", "gstin", "prefix", "margin", "auto approve",
      "budget alert", "threshold", "logo", "company settings",
    ],
    href: "/settings",
    body:
      "Settings (admin only) has two sections:\n\n1. Company Details — name, GSTIN, registered address, document number prefixes (GEC-INV, GEC-PO, etc.), logo.\n\n2. Thresholds — minimum margin % (proposals below this can't be approved), auto-approve limit for erection entries, budget alert % (triggers a warning when spend reaches X% of budget), low-stock multiplier.\n\nChanges take effect immediately — no redeploy needed.",
  },
  {
    id: "settings-integrations",
    title: "Set up API keys and integrations",
    keywords: [
      "api key", "integration", "whatsapp", "anthropic", "groq", "gemini",
      "resend", "email", "cron key", "integrations settings",
    ],
    href: "/settings/integrations",
    body:
      "Settings → Integrations & API Keys. Paste keys directly in the browser — no .env file or server restart needed:\n• WhatsApp Cloud API — for sending reminders and proposals.\n• AI provider — Anthropic (Claude), Groq or Gemini for AI features.\n• Email (Resend) — for email notifications.\n• Cron Key — for securing scheduled automation jobs.\n\nKeys are encrypted at rest. Only the last 4 characters are shown after saving.",
  },
  {
    id: "profile-password",
    title: "Update your profile or change password",
    keywords: [
      "profile", "password", "account", "my details", "change password",
      "name", "phone", "update profile",
    ],
    href: "/settings",
    body:
      "Settings → My Profile.\n• Update your display name and phone number → Save Profile.\n• Change password: enter your current password, then new password (confirm it) → Change Password.\n\nThis is available to every user for their own account — you don't need to be an admin.",
  },
  // ─── REPORTS / ANALYTICS ─────────────────────────────────────────────────
  {
    id: "reports",
    title: "Reports and analytics",
    keywords: [
      "report", "analytics", "receivables", "gst report", "collection",
      "dashboard", "kpi", "outstanding", "pipeline value",
    ],
    href: "/reports",
    body:
      "Reports (admin) at /reports shows:\n• Receivables — all outstanding amounts by project.\n• GST Filing Summary — taxable value, CGST, SGST, IGST by rate for a month. Export to Excel.\n• Collections — invoiced vs collected amounts.\n\nEach module also has its own Analytics page:\n• Leads Analytics — funnel, win rate, pipeline ₹.\n• Proposals Analytics — win rate by value, deal size.\n• Projects Analytics — on-time stages, receivables.\n• Service Analytics — AMC run-rate, visit compliance.\n• Materials Analytics — stock value, PO aging.\n• Erection Analytics — spend by type, budget overruns.",
  },
  // ─── ROLES / PERMISSIONS ─────────────────────────────────────────────────
  {
    id: "roles-visibility",
    title: "What can employees (field staff) see?",
    keywords: [
      "role", "permission", "employee", "admin", "visibility", "who can see",
      "pricing", "cost", "hidden", "field staff", "access",
    ],
    body:
      "Two roles in the app:\n\n• Admin — sees everything: purchase prices, cost estimates, margins, budgets, POs, vendor prices, full reports.\n\n• Employee (field staff) — sees their own leads and assigned project data, but NEVER sees purchase prices, cost estimates, margins, budgets, PO rates or vendor prices. These are stripped on the server — not just hidden on the screen.\n\nEmployees can: add leads, log follow-ups, update stage progress, attach photos, submit erection entries, raise material requests, log service visits.",
  },
  // ─── NAVIGATION ──────────────────────────────────────────────────────────
  {
    id: "navigation",
    title: "How to navigate the app",
    keywords: [
      "navigate", "menu", "sidebar", "where is", "how to find", "page",
      "go to", "open", "find page",
    ],
    body:
      "The sidebar (left panel on desktop, hamburger menu on mobile) has the main navigation:\n• Dashboard — overview KPIs, recent activity.\n• Leads — enquiries and follow-ups.\n• Proposals — quotes and BOQ.\n• Projects — active orders and stages.\n• Invoices — all invoices across projects.\n• Materials — stock, purchasing, requests.\n• Service — AMC contracts and tickets.\n• Erection — site expense entries.\n• Clients — customer 360° view.\n• Reports — financials (admin).\n• Settings — company and account settings.\n\nOn mobile, use the bottom navigation bar for quick access.",
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
 * Score help articles against a question by keyword overlap (title + keywords
 * weighted higher than body). Pure and deterministic — no network, works with
 * no AI key. Operates on English text only; Tamil questions go straight to Claude.
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

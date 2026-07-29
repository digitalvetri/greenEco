/**
 * Removes Leads, Clients (= leads with a proposal), Proposals, Projects/Orders, and
 * AMC/Service Contracts — and only what's structurally forced to go with them.
 *
 * An Order is created FROM a Won proposal (Order.proposalId is a required, unique FK),
 * so deleting Proposals means deleting the Orders they produced too, which in turn
 * means deleting everything scoped to an Order (stages, drawings, milestones, receipts,
 * invoices, documents, team assignments, budget, material requests, erection entries,
 * the auto-created SITE location) and everything scoped to an AMC contract (visits,
 * tickets). None of this is optional scope creep — it's referential integrity.
 *
 * Deliberately NOT touched: Item (catalog), Vendor, VendorPrice, PurchaseOrder, GRN,
 * StockMovement, Location(WAREHOUSE), User, Company, AuditLog, NumberSequence,
 * AutomationLog/Task/Setting, ConfigSetting, PushSubscription — none of these are tied
 * to a lead/proposal in a way that forces removal, and none were asked for.
 *
 * Run inside the production container (Coolify → app → Terminal, or a one-off
 * Scheduled Task — same mechanism DEPLOYMENT.md documents for prisma/seed.ts):
 *   npx tsx scripts/wipe-leads-clients-proposals-amc.ts
 *
 * Take a pg_dump backup first (scripts/backup.sh) — this is not reversible.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const counts: Record<string, number> = {};

    counts.stagePhoto = (await tx.stagePhoto.deleteMany({})).count;
    counts.stage = (await tx.stage.deleteMany({})).count;
    counts.drawing = (await tx.drawing.deleteMany({})).count;
    counts.document = (await tx.document.deleteMany({})).count;
    counts.receipt = (await tx.receipt.deleteMany({})).count;

    await tx.invoice.updateMany({ data: { creditNoteOfId: null } });
    counts.invoice = (await tx.invoice.deleteMany({})).count;

    counts.paymentMilestone = (await tx.paymentMilestone.deleteMany({})).count;
    counts.teamAssignment = (await tx.teamAssignment.deleteMany({})).count;
    counts.materialRequest = (await tx.materialRequest.deleteMany({})).count;
    counts.erectionEntry = (await tx.erectionEntry.deleteMany({})).count;
    counts.budget = (await tx.budget.deleteMany({})).count;
    counts.communication = (await tx.communication.deleteMany({})).count;
    counts.serviceTicket = (await tx.serviceTicket.deleteMany({})).count;
    counts.maintenanceVisit = (await tx.maintenanceVisit.deleteMany({})).count;

    await tx.serviceContract.updateMany({ data: { renewedFromId: null } });
    counts.serviceContract = (await tx.serviceContract.deleteMany({})).count;

    counts.locationSite = (await tx.location.deleteMany({ where: { type: "SITE" } })).count;
    counts.order = (await tx.order.deleteMany({})).count;
    counts.proposalDocument = (await tx.proposalDocument.deleteMany({})).count;
    counts.followUp = (await tx.followUp.deleteMany({})).count;
    counts.proposalVersion = (await tx.proposalVersion.deleteMany({})).count; // cascades BOQItem
    counts.proposalOutcome = (await tx.proposalOutcome.deleteMany({})).count;
    counts.proposal = (await tx.proposal.deleteMany({})).count;
    counts.contactPerson = (await tx.contactPerson.deleteMany({})).count;
    counts.leadDocument = (await tx.leadDocument.deleteMany({})).count;
    counts.lead = (await tx.lead.deleteMany({})).count;
    counts.reference = (await tx.reference.deleteMany({})).count;

    return counts;
  });

  console.log("Deleted row counts:", result);

  const remaining = {
    lead: await prisma.lead.count(),
    proposal: await prisma.proposal.count(),
    order: await prisma.order.count(),
    serviceContract: await prisma.serviceContract.count(),
    item: await prisma.item.count(),
    vendor: await prisma.vendor.count(),
    purchaseOrder: await prisma.purchaseOrder.count(),
    user: await prisma.user.count(),
  };
  console.log("Remaining after wipe (item/vendor/PO/user untouched, should match pre-run counts):", remaining);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

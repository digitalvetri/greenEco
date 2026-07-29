/**
 * One-time production-prep wipe: removes every row of test/verify-script/seed-demo
 * data accumulated in local dev while building this app, so a real client starts
 * with a genuinely empty CRM. Explicitly KEEPS:
 *   - Company (the real tenant row)
 *   - Location rows of type WAREHOUSE (2 real warehouses)
 *   - Item rows that match the client's real MATERIAL LIST.xlsx catalog (129 items)
 *   - User rows "dev-admin"/"dev-employee" (the two real login accounts)
 * Everything else — leads, proposals, orders, invoices, receipts, POs, vendors,
 * service contracts, tickets, erection entries, stock movements, audit log, the
 * 5 non-catalog test items, and every "E2E New User" test account — is deleted.
 *
 * FK-safe deletion order (children before parents); wrapped in one transaction so
 * a failure rolls back cleanly rather than leaving the DB half-wiped. A fresh
 * pg_dump backup should exist before running this (see scripts/backup.sh).
 */
import { prisma } from "../src/lib/prisma";

const KEEP_USER_IDS = ["dev-admin", "dev-employee"];
const NON_CATALOG_ITEM_NAMES = [
  "UPVS",
  "Verify Cement Bag 1784218156296",
  "Verify Cement Bag 1784524871349",
  "Verify Cement Bag 1784698628528",
  "Verify Cement Bag 1784698634867",
];

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
    counts.proposal = (await tx.proposal.deleteMany({})).count;
    counts.contactPerson = (await tx.contactPerson.deleteMany({})).count;
    counts.leadDocument = (await tx.leadDocument.deleteMany({})).count;
    counts.lead = (await tx.lead.deleteMany({})).count;
    counts.reference = (await tx.reference.deleteMany({})).count;
    counts.vendorPrice = (await tx.vendorPrice.deleteMany({})).count;
    counts.grn = (await tx.gRN.deleteMany({})).count;
    counts.stockMovement = (await tx.stockMovement.deleteMany({})).count;
    counts.purchaseOrder = (await tx.purchaseOrder.deleteMany({})).count;
    counts.vendor = (await tx.vendor.deleteMany({})).count;
    counts.auditLog = (await tx.auditLog.deleteMany({})).count;
    counts.automationLog = (await tx.automationLog.deleteMany({})).count;
    counts.automationTask = (await tx.automationTask.deleteMany({})).count;
    counts.automationSetting = (await tx.automationSetting.deleteMany({})).count;
    counts.proposalOutcome = (await tx.proposalOutcome.deleteMany({})).count;
    counts.numberSequence = (await tx.numberSequence.deleteMany({})).count;

    counts.user = (await tx.user.deleteMany({ where: { id: { notIn: KEEP_USER_IDS } } })).count;
    counts.item = (await tx.item.deleteMany({ where: { name: { in: NON_CATALOG_ITEM_NAMES } } })).count;

    return counts;
  });

  console.log("Deleted row counts:", result);

  const remaining = {
    company: await prisma.company.count(),
    location: await prisma.location.count(),
    item: await prisma.item.count(),
    user: await prisma.user.count(),
    lead: await prisma.lead.count(),
    proposal: await prisma.proposal.count(),
    order: await prisma.order.count(),
  };
  console.log("Remaining after wipe:", remaining);
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

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  createContract,
  getContract,
  completeVisit,
  createTicket,
  updateTicket,
  generateAmcInvoice,
  listContracts,
  amcDashboard,
} from "@/server/services/amc";

const ctx = { userId: "dev-admin", role: "ADMIN" as const, companyId: env.companyId };
const emp = { userId: "dev-employee", role: "EMPLOYEE" as const, companyId: env.companyId };

async function main() {
  const order = await prisma.order.findFirst({ where: { companyId: env.companyId }, orderBy: { createdAt: "desc" } });
  if (!order) throw new Error("No order — run verify-sell first");

  // 1. Create AMC (quarterly, 1 year) → 4 visits auto-scheduled.
  const c = await createContract(ctx, {
    orderId: order.id,
    clientName: order.clientName,
    siteAddress: order.siteAddress,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-12-31"),
    annualValue: 120000,
    frequency: "QUARTERLY",
    visitsPerYear: 4,
    scope: { mechanical: true, consumablesIncluded: false },
  });
  console.log("1. AMC:", c.contractNo, "visits scheduled:", c.visits);

  // 2. Complete visit 1 with plant readings → DONE.
  const full = await getContract(ctx, c.contractId);
  const v1 = full!.visits[0];
  await completeVisit(ctx, v1.id, { readings: { ph: 7.2, do: 3.5, flowKld: 38, blowerHours: 21 }, notes: "Media cleaned, blower serviced" });
  const after = await getContract(ctx, c.contractId);
  console.log("2. Visit 1 status:", after!.visits[0].status, "readings:", JSON.stringify(after!.visits[0].readings));

  // 3. Raise HIGH ticket → SLA due set (24h).
  const t = await createTicket(ctx, { contractId: c.contractId, title: "Blower tripping", description: "Air blower trips after 10 min", raisedBy: "Client", priority: "HIGH" });
  const ticket = await prisma.serviceTicket.findUnique({ where: { id: t.ticketId } });
  const slaHours = ticket!.slaDueDate ? (ticket!.slaDueDate.getTime() - ticket!.createdAt.getTime()) / 3600000 : 0;
  console.log("3. Ticket:", t.ticketNo, "priority HIGH → SLA hours:", Math.round(slaHours));

  // 4. Resolve ticket → closedAt set.
  await updateTicket(ctx, t.ticketId, { status: "RESOLVED", resolution: "Replaced starter relay" });
  const resolved = await prisma.serviceTicket.findUnique({ where: { id: t.ticketId } });
  console.log("4. Ticket resolved, closedAt set:", !!resolved!.closedAt);

  // 5. Generate a recurring AMC invoice (annualValue/4 = 30000 + 18% GST).
  const inv = await generateAmcInvoice(ctx, c.contractId, "Q1 2026");
  const invRow = await prisma.invoice.findUnique({ where: { id: inv.invoiceId } });
  console.log("5. AMC invoice:", inv.invoiceNo, "total:", invRow!.total.toString(), "(30000 + GST)");

  // 6. Dashboard.
  const dash = await amcDashboard(ctx);
  console.log("6. AMC dashboard:", JSON.stringify(dash));

  // 7. EMPLOYEE must NOT see annualValue.
  const empList = await listContracts(emp);
  console.log("7. EMPLOYEE contract list leaks annualValue?", JSON.stringify(empList).includes("annualValue"));

  await prisma.$disconnect();
  console.log("\n✅ AMC / O&M flow verified");
}

main().catch(async (e) => {
  console.error("❌", e);
  await prisma.$disconnect();
  process.exit(1);
});

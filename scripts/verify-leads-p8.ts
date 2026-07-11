/** Verifies bulk assign/status + RBAC. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { createLead, bulkAssign, bulkSetStatus } from "@/server/services/lead";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await createLead(A, { customerName: `P8 Bulk ${i}`, address: "12 Rd", phone: uniquePhone(), source: "Other" });
    if ("lead" in r && r.lead) ids.push(r.lead.id);
  }

  const a = await bulkAssign(A, ids, emp.id);
  check("bulkAssign updates all 3", a.updated === 3);
  const owners = await prisma.lead.findMany({ where: { id: { in: ids } }, select: { assignedToId: true } });
  check("all reassigned to employee", owners.every((o) => o.assignedToId === emp.id));

  const s = await bulkSetStatus(A, ids, "ON_HOLD");
  check("bulkSetStatus updates all 3", s.updated === 3);
  const statuses = await prisma.lead.findMany({ where: { id: { in: ids } }, select: { status: true } });
  check("all are ON_HOLD", statuses.every((x) => x.status === "ON_HOLD"));

  let threw = false;
  try { await bulkAssign(E, ids, emp.id); } catch { threw = true; }
  check("EMPLOYEE cannot bulk-assign (admin only)", threw);

  // employee bulk-status only affects leads they own (now they own these 3)
  const es = await bulkSetStatus(E, ids, "IN_FOLLOWUP");
  check("employee bulk-status affects only their own leads", es.updated === 3);

  console.log(`\n✅ Bulk actions verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());

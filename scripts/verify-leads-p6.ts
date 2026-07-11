/** Verifies lead documents (attach/list/delete + RBAC). */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { createLead, addLeadDocument, deleteLeadDocument, getLead } from "@/server/services/lead";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const r = await createLead(A, { customerName: "P6 Docs Lead", address: "12 Test Rd", phone: uniquePhone(), source: "CallIn" });
  if (!("lead" in r) || !r.lead) throw new Error("create failed");
  const id = r.lead.id;

  const d1 = await addLeadDocument(A, id, { url: "/uploads/water-report.pdf", name: "Water test report.pdf" });
  const d2 = await addLeadDocument(A, id, { url: "/uploads/site.jpg", name: "Site photo.jpg" });
  check("addLeadDocument persists", !!d1.id && d1.name === "Water test report.pdf");

  const full = await getLead(A, id);
  check("getLead returns documents", !!full && full.documents.length === 2);
  check("documents are newest-first", !!full && full.documents[0].id === d2.id);

  let threw = false;
  try { await addLeadDocument(E, id, { url: "/x", name: "hax" }); } catch { threw = true; }
  check("EMPLOYEE cannot attach to a lead they don't own", threw);
  threw = false;
  try { await deleteLeadDocument(E, d1.id); } catch { threw = true; }
  check("EMPLOYEE cannot delete another's lead doc", threw);

  await deleteLeadDocument(A, d1.id);
  const after = await getLead(A, id);
  check("deleteLeadDocument removes it", !!after && after.documents.length === 1);

  console.log(`\n✅ Lead documents verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());

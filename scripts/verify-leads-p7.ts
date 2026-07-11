/** Verifies follow-up edit/delete + RBAC + no status rewrite. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { createLead, addFollowUp, updateFollowUp, deleteFollowUp } from "@/server/services/lead";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const r = await createLead(A, { customerName: "P7 FU Lead", address: "12 Test Rd", phone: uniquePhone(), source: "CallIn" });
  if (!("lead" in r) || !r.lead) throw new Error("create failed");
  const id = r.lead.id;
  const fu = await addFollowUp(A, { leadId: id, type: "CALL", notes: "orignal typo", outcome: "INTERESTED", nextDate: new Date(Date.now() + 3 * 86400000) });
  const statusAfterCreate = (await prisma.lead.findUnique({ where: { id } }))!.status;

  await updateFollowUp(A, fu.id, { notes: "corrected note", outcome: "PRICE_DISCUSSION" });
  const edited = await prisma.followUp.findUnique({ where: { id: fu.id } });
  check("notes updated", edited?.notes === "corrected note");
  check("outcome updated", edited?.outcome === "PRICE_DISCUSSION");
  const statusAfterEdit = (await prisma.lead.findUnique({ where: { id } }))!.status;
  check("editing a follow-up does NOT rewrite lead status", statusAfterEdit === statusAfterCreate);

  let threw = false;
  try { await updateFollowUp(E, fu.id, { notes: "hax" }); } catch { threw = true; }
  check("EMPLOYEE cannot edit a follow-up on a lead they don't own", threw);
  threw = false;
  try { await deleteFollowUp(E, fu.id); } catch { threw = true; }
  check("EMPLOYEE cannot delete it either", threw);

  await deleteFollowUp(A, fu.id);
  check("deleteFollowUp removes it", (await prisma.followUp.findUnique({ where: { id: fu.id } })) === null);

  console.log(`\n✅ Follow-up edit/delete verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());

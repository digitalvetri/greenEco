/** Verifies Proposals P2: documents + send-to-client tracking + timeline merge. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import {
  addProposalDocument, deleteProposalDocument, getProposal, sendProposalToClient, proposalActivity,
} from "@/server/services/proposal";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const lead = await createLead(A, { customerName: "P2 Prop Docs", address: "12 Rd, Chennai", phone: uniquePhone(), source: "CallIn" });
  if (!("lead" in lead) || !lead.lead) throw new Error("lead failed");
  const pid = (await convertToProposal(A, lead.lead.id)).proposalId;

  // documents
  console.log("documents");
  const d1 = await addProposalDocument(A, pid, { url: "/uploads/signed.pdf", name: "Signed proposal.pdf" });
  check("addProposalDocument persists", d1.name === "Signed proposal.pdf");
  let full = await getProposal(A, pid);
  check("getProposal returns documents", !!full && (full as { documents: unknown[] }).documents.length === 1);
  await deleteProposalDocument(A, d1.id);
  full = await getProposal(A, pid);
  check("delete removes it", !!full && (full as { documents: unknown[] }).documents.length === 0);

  // send tracking (gated)
  console.log("send tracking");
  const wa = await sendProposalToClient(A, pid, "WHATSAPP");
  check("WhatsApp send is gated → LOGGED", wa.sent === false && wa.status === "LOGGED");
  const commRow = await prisma.communication.findFirst({ where: { proposalId: pid, channel: "WHATSAPP" } });
  check("a Communication row is recorded against the proposal", !!commRow && commRow.direction === "OUT");

  // email to a lead with no email → throws
  let threw = false;
  try { await sendProposalToClient(A, pid, "EMAIL"); } catch { threw = true; }
  check("email send throws when the lead has no email", threw);

  // RBAC: employee cannot send
  threw = false;
  try { await sendProposalToClient(E, pid, "WHATSAPP"); } catch { threw = true; }
  check("EMPLOYEE cannot send a proposal (admin only)", threw);

  // timeline merges the comm
  const events = await proposalActivity(A, pid);
  check("proposalActivity includes the comm event", !!events && events.some((e) => e.kind === "comm"));

  console.log(`\n✅ Proposals P2 (documents + send) verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());

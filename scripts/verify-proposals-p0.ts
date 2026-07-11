/** Verifies Proposals P0: pagination, dead-status fix (UNDER_NEGOTIATION/reopen), expiry, stats. */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import { approveAndSend, setProposalStatus, markLost, listProposals, proposalStats } from "@/server/services/proposal";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  // create a lead → proposal → SENT
  const lead = await createLead(A, { customerName: "P0 Prop Lead", address: "12 Rd, Chennai", phone: uniquePhone(), source: "CallIn" });
  if (!("lead" in lead) || !lead.lead) throw new Error("lead create failed");
  const conv = await convertToProposal(A, lead.lead.id);
  const pid = conv.proposalId;
  await approveAndSend(A, pid); // DRAFT -> SENT (no est cost → no margin guard)
  let p = await prisma.proposal.findUnique({ where: { id: pid } });
  check("approveAndSend flips DRAFT → SENT", p?.status === "SENT");

  // P0-1: UNDER_NEGOTIATION is now reachable
  await setProposalStatus(A, pid, "UNDER_NEGOTIATION");
  p = await prisma.proposal.findUnique({ where: { id: pid } });
  check("setProposalStatus → UNDER_NEGOTIATION (was a dead status)", p?.status === "UNDER_NEGOTIATION");

  // reopen from LOST
  await markLost(A, pid, "Price");
  await setProposalStatus(A, pid, "SENT");
  p = await prisma.proposal.findUnique({ where: { id: pid } });
  check("reopen LOST → SENT clears lostReason", p?.status === "SENT" && p?.lostReason === null);

  // guards
  let threw = false;
  try { await setProposalStatus(E, pid, "UNDER_NEGOTIATION"); } catch { threw = true; }
  check("EMPLOYEE cannot change proposal status (admin only)", threw);
  const won = await prisma.proposal.findFirst({ where: { companyId: A.companyId, status: "WON" } });
  if (won) { threw = false; try { await setProposalStatus(A, won.id, "SENT"); } catch { threw = true; } check("a WON proposal is locked", threw); }

  // expiry attached to the SENT proposal (fresh → active)
  const list = await listProposals(A, { take: 100 });
  const row = list.items.find((x) => x.id === pid);
  check("listProposals attaches expiry to a live proposal", !!row && row.expiry?.state === "active");
  check("listProposals returns {items,nextCursor}", Array.isArray(list.items) && "nextCursor" in list);

  // pagination
  const pg1 = await listProposals(A, { take: 1 });
  check("page 1 returns a nextCursor when >1 exist", pg1.items.length === 1 && pg1.nextCursor !== null);
  const pg2 = await listProposals(A, { take: 1, cursor: pg1.nextCursor! });
  check("page 2 via cursor is a different proposal", pg2.items[0] && pg2.items[0].id !== pg1.items[0].id);

  // EXPIRED computed view
  const exp = await listProposals(A, { status: "expired" });
  check("EXPIRED view returns a worklist (all expired, no cursor)", exp.nextCursor === null && exp.items.every((x) => x.expiry?.state === "expired"));

  // stats
  const s = await proposalStats(A);
  check("proposalStats shape", ["inPlay", "draft", "won", "expiring", "pipelineValue"].every((k) => k in s));
  check("stats counts are non-negative", [s.inPlay, s.draft, s.won, s.expiring, s.pipelineValue].every((n) => n >= 0));

  console.log(`\n✅ Proposals P0 verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());

/** Verifies Proposals P1-1: version/activity timeline (price history + events). */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { createLead, convertToProposal } from "@/server/services/lead";
import { saveVersion, approveAndSend, proposalActivity } from "@/server/services/proposal";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);
const boq = (rate: number) => [{ category: "Civil", item: "Tank", unit: "cum", qty: 10, rate, amount: 10 * rate, aiSuggested: false }];

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const lead = await createLead(A, { customerName: "P1 Prop Timeline", address: "12 Rd, Chennai", phone: uniquePhone(), source: "CallIn" });
  if (!("lead" in lead) || !lead.lead) throw new Error("lead failed");
  const pid = (await convertToProposal(A, lead.lead.id)).proposalId;

  // v1 BOQ (draft, in-place) → grand ~₹1,18,000 (10×10000 + 18% GST)
  await saveVersion(A, pid, { boqItems: boq(10000) });
  await approveAndSend(A, pid); // SENT + approvedById on v1
  // v2 (post-SENT bump) with a higher rate + changeNote → price goes UP
  await saveVersion(A, pid, { boqItems: boq(12000), changeNote: "Client asked for a bigger blower" });

  const events = await proposalActivity(A, pid);
  check("timeline returns events", !!events && events.length >= 4);
  const kinds = events!.map((e) => e.kind);
  check("includes 'created'", kinds.includes("created"));
  check("includes version events", kinds.filter((k) => k === "version").length >= 2);
  check("includes 'approved'", kinds.includes("approved"));

  // the v2 event carries a price delta (the negotiation trail)
  const v2 = events!.find((e) => e.title === "v2");
  check("v2 has an amount", !!v2?.amount);
  check("v2 shows an upward price delta (10000→12000/unit)", v2?.delta?.dir === "up");

  check("newest-first", events!.every((e, i) => i === 0 || new Date(events![i - 1].at) >= new Date(e.at)));

  // RBAC: another company's proposal is not visible
  const other = await proposalActivity({ ...A, companyId: "nonexistent" }, pid);
  check("proposalActivity is company-scoped (null cross-tenant)", other === null);

  console.log(`\n✅ Proposals P1-1 (timeline) verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());

/** Verifies lead Communication (log + gated send + timeline merge + RBAC). */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { createLead, logCommunication, sendLeadWhatsApp, sendLeadEmail, leadActivity } from "@/server/services/lead";

const uniquePhone = () => "9" + String(Date.now()).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => { console.log(`  ${ok ? "✓" : "✗"} ${l}`); if (!ok) throw new Error("FAIL: " + l); pass++; };

  const r = await createLead(A, { customerName: "P5 Comm Lead", address: "x", phone: uniquePhone(), source: "CallIn", email: "client@example.com" });
  if (!("lead" in r) || !r.lead) throw new Error("create failed");
  const id = r.lead.id;

  console.log("log call");
  const call = await logCommunication(A, { leadId: id, channel: "CALL", direction: "OUT", body: "Discussed 50 KLD STP" });
  check("logCommunication creates a CALL row", call.channel === "CALL" && call.sentStatus === "LOGGED");

  console.log("gated WhatsApp send");
  const wa = await sendLeadWhatsApp(A, id, "Hi, sharing our STP proposal shortly.");
  check("no transport → sent=false, transport none", wa.delivery.sent === false && wa.delivery.transport === "none");
  check("WhatsApp still LOGGED as a communication", wa.comm.channel === "WHATSAPP" && wa.comm.sentStatus === "LOGGED");

  console.log("gated email send");
  const em = await sendLeadEmail(A, id, "Your STP proposal", "Please find attached…");
  check("email with no provider → LOGGED", em.comm.channel === "EMAIL" && em.comm.sentStatus === "LOGGED");
  const noEmailLead = await createLead(A, { customerName: "P5 No Email", address: "x", phone: uniquePhone(), source: "Other" });
  if (!("lead" in noEmailLead) || !noEmailLead.lead) throw new Error("create failed");
  let threw = false;
  try { await sendLeadEmail(A, noEmailLead.lead.id, "s", "b"); } catch { threw = true; }
  check("email to a lead with no address throws", threw);

  console.log("timeline merge");
  const events = await leadActivity(A, id);
  const commEvents = events!.filter((e) => e.kind === "comm");
  check("timeline includes 3 comm events (call+wa+email)", commEvents.length === 3);
  check("comm events carry channel + direction", commEvents.every((e) => e.comm && e.comm.channel && e.comm.direction));

  console.log("RBAC");
  threw = false;
  try { await logCommunication(E, { leadId: id, channel: "CALL", body: "hax" }); } catch { threw = true; }
  check("EMPLOYEE cannot log on a lead they don't own", threw);

  console.log(`\n✅ Lead communications verified — ${pass} checks passed`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => prisma.$disconnect());

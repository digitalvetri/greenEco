/**
 * Verifies the Drawings module end-to-end against the live DB, in three roles:
 * an admin, an employee WITH the DRAWINGS capability, and one WITHOUT it.
 *
 * The important assertions are negative: an employee without the grant must not be
 * able to raise a request, deliver a drawing, or browse other people's queue — while
 * still keeping the access they had before (viewing drawings on their own projects).
 *
 * Also proves the request→deliver→request-changes→Rev B→accept loop, which is the
 * whole point of the module.
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID } from "@/lib/env";
import { CAPABILITIES } from "@/lib/rbac";
import { createLead } from "@/server/services/lead";
import {
  createDrawingRequest,
  listDrawingRequests,
  getDrawingRequest,
  assignDrawingRequest,
  deliverDrawing,
  reviewDelivery,
  cancelDrawingRequest,
  reopenDrawingRequest,
  drawingStats,
  listDrawings,
  drawingRevisions,
  setApproval,
} from "@/server/services/drawing";

const uniquePhone = () => "9" + String(Date.now() + Math.floor(Math.random() * 900)).slice(-9);

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  if (!admin) throw new Error("seed first");
  const employee = await prisma.user.findFirst({
    where: { companyId: admin.companyId, role: "EMPLOYEE", active: true },
  });
  if (!employee) throw new Error("need an EMPLOYEE user — run db:seed");

  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId, capabilities: admin.capabilities };
  // Same person, two grant states — proves the capability itself is what gates, not the role.
  const E_NO = { userId: employee.id, role: employee.role, companyId: employee.companyId, capabilities: [] };
  const E_YES = { ...E_NO, capabilities: [CAPABILITIES.DRAWINGS] };

  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };
  const blocked = async (l: string, fn: () => Promise<unknown>) => {
    let threw = false;
    try {
      await fn();
    } catch {
      threw = true;
    }
    check(l, threw);
  };

  const leadIds: string[] = [];
  const requestIds: string[] = [];
  const drawingIds: string[] = [];

  try {
    const leadRes = await createLead(A, {
      customerName: `Drawing Co ${Date.now()}`,
      address: "9 CAD Street, Coimbatore",
      phone: uniquePhone(),
      source: "CallIn",
      plantType: "STP",
      technology: "MBBR",
      capacityKLD: 30,
    });
    if (!("lead" in leadRes) || !leadRes.lead) throw new Error("lead create failed");
    const leadId = leadRes.lead.id;
    leadIds.push(leadId);

    // ---------- The capability is what gates, not the role ----------
    await blocked("employee WITHOUT the grant cannot raise a request", () =>
      createDrawingRequest(E_NO, { title: "Should not exist", discipline: "Layout" }),
    );

    const req = await createDrawingRequest(E_YES, {
      title: "GA layout — 30 KLD STP",
      discipline: "Layout",
      leadId,
      notes: "Invert level 2.5 ft; blower outside the plant room.",
    });
    requestIds.push(req.id);
    check("employee WITH the grant can raise one", req.status === "OPEN");
    check("it attaches to the enquiry, with no project", req.leadId === leadId && req.orderId === null);

    // The proposal document promises drawings within 10 days of the P.O.
    const days = Math.round(((req.dueDate?.getTime() ?? 0) - Date.now()) / 86_400_000);
    check(`due date defaults to the proposal's own 10-day commitment (got ${days})`, days === 10);

    // ---------- A standalone request (no project, no enquiry) ----------
    const standalone = await createDrawingRequest(A, { title: "Standard blower plinth detail", discipline: "Civil" });
    requestIds.push(standalone.id);
    check("a request can name neither a project nor an enquiry", !standalone.orderId && !standalone.leadId);

    // ---------- Cross-tenant ids are refused ----------
    const foreignLead = await prisma.lead.findFirst({
      where: { companyId: { not: admin.companyId } },
      select: { id: true },
    });
    if (foreignLead) {
      await blocked("a cross-tenant leadId is refused", () =>
        createDrawingRequest(A, { title: "Cross tenant", discipline: "Layout", leadId: foreignLead.id }),
      );
    } else {
      console.log("  – skipped cross-tenant check (single-tenant DB)");
    }
    await blocked("naming BOTH a project and an enquiry is refused", () =>
      createDrawingRequest(A, { title: "Both", discipline: "Layout", leadId, orderId: leadId }),
    );

    // ---------- Queue visibility ----------
    const adminQueue = await listDrawingRequests(A, { take: 100 });
    check("admin sees the whole queue", adminQueue.items.some((r) => r.id === req.id));

    const grantedQueue = await listDrawingRequests(E_YES, { take: 100 });
    check("a grant holder sees the whole queue", grantedQueue.items.some((r) => r.id === standalone.id));

    const ungrantedQueue = await listDrawingRequests(E_NO, { take: 100 });
    check(
      "without the grant an employee sees ONLY what they raised",
      ungrantedQueue.items.every((r) => r.requestedById === E_NO.userId),
    );
    check(
      "…so the admin's standalone request is hidden from them",
      !ungrantedQueue.items.some((r) => r.id === standalone.id),
    );
    check(
      "…but their own request is still visible",
      ungrantedQueue.items.some((r) => r.id === req.id),
    );
    check("…and getDrawingRequest is scoped the same way", (await getDrawingRequest(E_NO, standalone.id)) === null);

    // ---------- Assignment ----------
    await assignDrawingRequest(A, req.id, employee.id);
    const assigned = await prisma.drawingRequest.findUnique({ where: { id: req.id } });
    check("assigning moves it into progress", assigned?.status === "IN_PROGRESS" && assigned.assignedToId === employee.id);
    await blocked("an employee without the grant cannot assign", () => assignDrawingRequest(E_NO, req.id, employee.id));

    // ---------- Deliver ----------
    await blocked("…nor deliver a drawing", () =>
      deliverDrawing(E_NO, req.id, { fileUrl: "/uploads/fake.dwg" }),
    );

    const d1 = await deliverDrawing(E_YES, req.id, { fileUrl: "/uploads/ga-rev-a.dwg" });
    drawingIds.push(d1.drawing.id);
    check("delivering creates Rev A", d1.drawing.revision === "A");
    check("…and moves the request to DELIVERED", d1.request.status === "DELIVERED");
    check("…linked back to the request", d1.drawing.requestId === req.id);
    check("…with no order, since the request named an enquiry", d1.drawing.orderId === null);
    check("…but still company-scoped", d1.drawing.companyId === admin.companyId);

    // ---------- Only the requester (or an admin) reviews ----------
    const other = await prisma.user.findFirst({
      where: { companyId: admin.companyId, id: { notIn: [employee.id, admin.id] } },
    });
    if (other) {
      await blocked("a third party cannot review the delivery", () =>
        reviewDelivery(
          { userId: other.id, role: other.role, companyId: other.companyId, capabilities: other.capabilities },
          req.id,
          "ACCEPT",
        ),
      );
    } else {
      console.log("  – skipped third-party review check (only 2 users)");
    }

    await blocked("requesting changes without a reason is refused", () =>
      reviewDelivery(E_YES, req.id, "REQUEST_CHANGES"),
    );

    // ---------- Request changes → Rev B ----------
    const sentBack = await reviewDelivery(E_YES, req.id, "REQUEST_CHANGES", "Move the blower outside the room");
    check("sending back reopens the request", sentBack.status === "CHANGES_REQUESTED");
    check("…and records why", sentBack.changeReason === "Move the blower outside the room");

    const d2 = await deliverDrawing(E_YES, req.id, { fileUrl: "/uploads/ga-rev-b.dwg" });
    drawingIds.push(d2.drawing.id);
    check("the re-delivery becomes Rev B automatically", d2.drawing.revision === "B");
    const revA = await prisma.drawing.findUnique({ where: { id: d1.drawing.id } });
    check("…and Rev A is superseded", revA?.isCurrent === false && revA?.approvalStatus === "SUPERSEDED");
    check("…while Rev B is current", d2.drawing.isCurrent === true);

    const history = await drawingRevisions(E_YES, d2.drawing.id);
    check("revision history returns BOTH revisions", (history ?? []).length === 2);
    check(
      "…newest first",
      (history ?? [])[0]?.revision === "B" && (history ?? [])[1]?.revision === "A",
    );

    // ---------- Accept ----------
    const accepted = await reviewDelivery(E_YES, req.id, "ACCEPT");
    check("accepting completes the request", accepted.status === "COMPLETED" && accepted.closedAt !== null);
    await blocked("a completed request can't be delivered against again", () =>
      deliverDrawing(E_YES, req.id, { fileUrl: "/uploads/late.dwg" }),
    );

    // ---------- Case-insensitive revision chain ----------
    const caseReq = await createDrawingRequest(A, { title: "Plant Room Detail", discipline: "Civil" });
    requestIds.push(caseReq.id);
    const c1 = await deliverDrawing(A, caseReq.id, { fileUrl: "/uploads/c1.dwg" });
    drawingIds.push(c1.drawing.id);
    await reviewDelivery(A, caseReq.id, "REQUEST_CHANGES", "wrong scale");
    const c2 = await deliverDrawing(A, caseReq.id, { fileUrl: "/uploads/c2.dwg" });
    drawingIds.push(c2.drawing.id);
    check("a re-delivery of the same title continues the chain (Rev B, not a second Rev A)", c2.drawing.revision === "B");

    // ---------- Cancel / reopen ----------
    const cancelReq = await createDrawingRequest(E_YES, { title: "No longer needed", discipline: "Piping" });
    requestIds.push(cancelReq.id);
    await cancelDrawingRequest(E_YES, cancelReq.id, "Client changed the layout");
    check("cancelling closes it", (await prisma.drawingRequest.findUnique({ where: { id: cancelReq.id } }))?.status === "CANCELLED");
    await reopenDrawingRequest(A, cancelReq.id);
    check("reopening returns it to the queue", (await prisma.drawingRequest.findUnique({ where: { id: cancelReq.id } }))?.status === "OPEN");

    // ---------- Approval — the service that had no UI ----------
    await blocked("an employee cannot set approval, even with the drawing grant", () =>
      setApproval(E_YES, d2.drawing.id, "APPROVED"),
    );
    await setApproval(A, d2.drawing.id, "FOR_APPROVAL");
    check("admin can reach FOR_APPROVAL (previously unreachable)",
      (await prisma.drawing.findUnique({ where: { id: d2.drawing.id } }))?.approvalStatus === "FOR_APPROVAL");
    await setApproval(A, d2.drawing.id, "APPROVED");
    check("…and APPROVED",
      (await prisma.drawing.findUnique({ where: { id: d2.drawing.id } }))?.approvalStatus === "APPROVED");

    // ---------- Library ----------
    const current = await listDrawings(A, { take: 100 });
    check("library shows current revisions by default", current.items.some((d) => d.id === d2.drawing.id));
    check("…and hides superseded ones", !current.items.some((d) => d.id === d1.drawing.id));
    const withHistory = await listDrawings(A, { take: 200, includeHistory: true });
    check("…until history is switched on", withHistory.items.some((d) => d.id === d1.drawing.id));

    const empLibrary = await listDrawings(E_NO, { take: 200, includeHistory: true });
    check(
      "without the grant, standalone drawings are not browsable",
      !empLibrary.items.some((d) => d.id === d2.drawing.id),
    );

    // ---------- Stats ----------
    const stats = await drawingStats(A);
    check("stats are non-negative and coherent", stats.open >= 0 && stats.completed >= 1);

    // ---------- Stored drawing files are behind a login ----------
    // Drawings are internal engineering documents, unlike an invoice PDF a customer
    // opens from a WhatsApp link. Requires a running dev server on APP_URL; skipped
    // cleanly when there isn't one, so the rest of the script still runs standalone.
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const reachable = await fetch(`${base}/api/healthz`).then((r) => r.ok).catch(() => false);
    // AUTH_DEV_BYPASS makes getSession() succeed with no cookie, which defeats the
    // gate by design — so a bypassed server CANNOT prove it. Probe a session-gated
    // API to find out which kind of server we're pointed at, and say so plainly
    // rather than reporting a pass the environment didn't earn.
    const bypassed = reachable
      ? await fetch(`${base}/api/proposals`).then((r) => r.ok).catch(() => false)
      : false;
    if (!reachable) {
      console.log(`  – skipped file-gate checks (no server on ${base})`);
    } else if (bypassed) {
      // A bypassed server treats every request as signed in, so it can't prove the
      // REFUSAL — but it proves the other half, which matters just as much: a signed-in
      // user must still be able to open a drawing, or the gate has broken the feature
      // for everyone. Run this script against both kinds of server for full coverage.
      const { writeFile, mkdir, rm } = await import("fs/promises");
      const pathMod = await import("path");
      const dir = pathMod.join(process.cwd(), "public", "secure");
      const name = `verify-gate-${Date.now()}.dwg`;
      await mkdir(dir, { recursive: true });
      await writeFile(pathMod.join(dir, name), "not-a-real-dwg");
      try {
        const res = await fetch(`${base}/secure/${name}`);
        check(`a SIGNED-IN request CAN read a secure file (got ${res.status})`, res.status === 200);
        check(
          "…and it is not cached publicly, so a shared cache can't leak it",
          (res.headers.get("cache-control") ?? "").includes("private"),
        );
      } finally {
        await rm(pathMod.join(dir, name), { force: true });
      }
      console.log(
        "  – the signed-OUT refusal can't be proven here (AUTH_DEV_BYPASS authenticates\n" +
          "    everything). Re-run against a server started without it for that half.",
      );
    } else {
      const openFile = await fetch(`${base}/uploads/definitely-not-a-real-file.pdf`);
      check("the OPEN root still answers without a session (404 for a miss, not a redirect)", openFile.status === 404);

      const secureFile = await fetch(`${base}/secure/definitely-not-a-real-file.dwg`, { redirect: "manual" });
      check(
        `a signed-out request for a secure file is refused (got ${secureFile.status})`,
        secureFile.status === 404 || secureFile.status === 401 || secureFile.status === 403,
      );

      // A real file, written where the secure root serves from, must still be gated.
      const { writeFile, mkdir, rm } = await import("fs/promises");
      const pathMod = await import("path");
      const dir = pathMod.join(process.cwd(), "public", "secure");
      const name = `verify-gate-${Date.now()}.dwg`;
      await mkdir(dir, { recursive: true });
      await writeFile(pathMod.join(dir, name), "not-a-real-dwg");
      try {
        const res = await fetch(`${base}/secure/${name}`, { redirect: "manual" });
        check(`an EXISTING secure file is not served to a signed-out request (got ${res.status})`, res.status !== 200);
        // Sanity: the same bytes under the open root ARE served, proving the gate is
        // what refused it and not a broken route.
        const openDir = pathMod.join(process.cwd(), "public", "uploads");
        await mkdir(openDir, { recursive: true });
        await writeFile(pathMod.join(openDir, name), "not-a-real-dwg");
        const openRes = await fetch(`${base}/uploads/${name}`);
        check("…while the same file under the open root IS served (so the route works)", openRes.status === 200);
        await rm(pathMod.join(openDir, name), { force: true });
      } finally {
        await rm(pathMod.join(dir, name), { force: true });
      }
    }

    console.log(`\n✅ verify-drawings-p0: ${pass} checks passed`);
  } finally {
    await prisma.automationTask.deleteMany({ where: { entity: "DrawingRequest", entityId: { in: requestIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...requestIds, ...drawingIds] } } });
    await prisma.drawing.deleteMany({ where: { id: { in: drawingIds } } });
    await prisma.drawingRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.contactPerson.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    console.log("   (test rows cleaned up)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

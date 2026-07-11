/**
 * Verifies the Tally voucher export: well-formed ENVELOPE, one VOUCHER per invoice,
 * every voucher is a balanced double-entry (Σ ledger amounts ≈ 0), credit notes map
 * to Credit-Note vouchers, and EMPLOYEE is blocked. Read-only (no rows written).
 */
import { prisma } from "@/lib/prisma";
import { DEV_ADMIN_ID, DEV_EMPLOYEE_ID } from "@/lib/env";
import { buildTallyXml } from "@/server/services/tally";

async function main() {
  const admin = await prisma.user.findUnique({ where: { id: DEV_ADMIN_ID } });
  const emp = await prisma.user.findUnique({ where: { id: DEV_EMPLOYEE_ID } });
  if (!admin || !emp) throw new Error("seed first");
  const A = { userId: admin.id, role: admin.role, companyId: admin.companyId };
  const E = { userId: emp.id, role: emp.role, companyId: emp.companyId };
  let pass = 0;
  const check = (l: string, ok: boolean) => {
    console.log(`  ${ok ? "✓" : "✗"} ${l}`);
    if (!ok) throw new Error("FAIL: " + l);
    pass++;
  };

  const invCount = await prisma.invoice.count({ where: { companyId: A.companyId } });
  const { xml, count } = await buildTallyXml(A);

  check("count matches the invoice table", count === invCount);
  check(
    "well-formed vouchers envelope",
    xml.startsWith("<?xml") && xml.includes("<ENVELOPE>") && xml.includes("</ENVELOPE>") && xml.includes("<REPORTNAME>Vouchers</REPORTNAME>"),
  );
  check("one VOUCHER per invoice", (xml.match(/<VOUCHER /g)?.length ?? 0) === invCount);

  // Each voucher must be a balanced double-entry: debits (−) + credits (+) ≈ 0.
  const vouchers = xml.split("<VOUCHER ").slice(1).map((v) => v.split("</VOUCHER>")[0]);
  let allBalanced = vouchers.length === invCount;
  for (const v of vouchers) {
    const amounts = [...v.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => parseFloat(m[1]));
    const sum = amounts.reduce((a, b) => a + b, 0);
    if (amounts.length < 2 || Math.abs(sum) > 0.02) allBalanced = false;
  }
  check("every voucher balances (Σ ledger amounts ≈ 0)", allBalanced);
  check("Sales + output-tax ledgers present", invCount === 0 || (xml.includes("<LEDGERNAME>Sales</LEDGERNAME>") && /Output (CGST|SGST|IGST)/.test(xml)));

  const cnCount = await prisma.invoice.count({ where: { companyId: A.companyId, isCreditNote: true } });
  check("credit notes export as Credit-Note vouchers", (xml.match(/VCHTYPE="Credit Note"/g)?.length ?? 0) === cnCount);

  let blocked = false;
  try {
    await buildTallyXml(E);
  } catch {
    blocked = true;
  }
  check("EMPLOYEE blocked from the Tally export", blocked);

  console.log(`\n✅ Tally export verified — ${pass} checks passed (${invCount} invoices, ${cnCount} credit notes)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

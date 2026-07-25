/**
 * One-time import of the client's vendor equipment price list
 * (`~/Downloads/MATERIAL LIST.xlsx`) into the Item master, all at zero opening
 * stock (user will run Stock Audit in-app to record real on-hand quantities).
 *
 * The sheet is a multi-brand catalog (Air Blowers, Submersible/Mono Block
 * Pumps, 3-Phase Motors, Filter Vessels) with columns:
 * [NAME OF ITEM, MAKE, MODEL, SPECIFICATION, PRICE, FREIGHT, LOADING/UNLOADING,
 *  GST 18%, TOTAL (WITH GST), TOTAL INCLUDING FREIGHT AND UNLOADING] — no
 * quantity column. purchasePrice is seeded from the base PRICE (excl.
 * GST/freight); brand (MAKE) is folded into the name + specification rather
 * than creating Vendor masters (the sheet has no phone/GSTIN for those).
 *
 * Idempotent: skips any (companyId, name) pair that already exists.
 */
import xlsx from "xlsx";
import { Decimal } from "decimal.js";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { DEV_ADMIN_ID } from "@/lib/env";

const FILE_PATH = "/Users/selva/Downloads/MATERIAL LIST.xlsx";
const COMPANY_ID = "green-ecocare";
const ctx = { userId: DEV_ADMIN_ID, role: "ADMIN" as const, companyId: COMPANY_ID };

type Row = [
  unknown, // blank leading column
  string | undefined, // NAME OF ITEM
  string | undefined, // MAKE
  string | number | undefined, // MODEL
  string | undefined, // SPECIFICATION
  number | undefined, // PRICE
  number | undefined, // FREIGHT
  number | undefined, // LOADING/UNLOADING
  number | undefined, // GST 18%
  number | undefined, // TOTAL (WITH GST)
  number | undefined, // TOTAL INCL FREIGHT
];

const TYPE_MAP: Record<string, { label: string; category: string }> = {
  "AIR BLOWER": { label: "Air Blower", category: "Blowers" },
  "AIR BLOWER ACOUSTIC HOOD": { label: "Air Blower (Acoustic Hood)", category: "Blowers" },
  "AIR BLOWER ACCOUSTIC HOOD": { label: "Air Blower (Acoustic Hood)", category: "Blowers" },
  "SEWAGE PUMP SUBMERSIBLE": { label: "Sewage Submersible Pump", category: "PumpsMotors" },
  PUMP: { label: "Pump", category: "PumpsMotors" },
  "OPENWELL SUBMERSIBLE": { label: "Openwell Submersible Pump", category: "PumpsMotors" },
  "OPEN WELL SUBMERSIBLE": { label: "Openwell Submersible Pump", category: "PumpsMotors" },
  "MONO BLOCK PUMP": { label: "Mono Block Pump", category: "PumpsMotors" },
  "MONO BLOCK SLUDGE PUMP": { label: "Mono Block Sludge Pump", category: "PumpsMotors" },
  "3 PHASE MOTOR": { label: "3 Phase Motor", category: "PumpsMotors" },
  "MS FILTER VESSEL": { label: "MS Filter Vessel", category: "Plumbing" },
  "FRP FILTER VESSEL": { label: "FRP Filter Vessel", category: "Plumbing" },
};

function norm(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

async function main() {
  const wb = xlsx.readFile(FILE_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<Row>(sheet, { header: 1 }).slice(1); // drop header row

  type Mapped = { name: string; category: string; specification: string; purchasePrice: number | null };
  const mapped: Mapped[] = [];

  for (const r of rows) {
    const typeRaw = norm(r[1]);
    const makeRaw = norm(r[2]);
    const modelRaw = r[3] == null ? "" : norm(String(r[3]));
    const specRaw = norm(r[4]);
    const price = typeof r[5] === "number" ? r[5] : null;
    if (!typeRaw || !makeRaw) continue; // skip blank padding rows

    const typeInfo = TYPE_MAP[typeRaw.toUpperCase()];
    if (!typeInfo) throw new Error(`Unmapped item type: "${typeRaw}"`);

    const modelStartsWithMake = modelRaw.toUpperCase().startsWith(makeRaw.toUpperCase());
    const name = norm(`${typeInfo.label} ${modelStartsWithMake ? "" : makeRaw} ${modelRaw}`);
    const specification = specRaw ? `${specRaw} — Make: ${makeRaw}` : `Make: ${makeRaw}`;
    const purchasePrice = price && price > 0 ? price : null; // 0 in the sheet means "price TBD", not free

    mapped.push({ name, category: typeInfo.category, specification, purchasePrice });
  }

  // Disambiguate name collisions (e.g. the same model listed twice at different
  // pressure ratings) by appending a distinguishing token pulled from the spec.
  const counts = new Map<string, number>();
  for (const m of mapped) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
  const seenSoFar = new Map<string, number>();
  for (const m of mapped) {
    if ((counts.get(m.name) ?? 0) <= 1) continue;
    const n = (seenSoFar.get(m.name) ?? 0) + 1;
    seenSoFar.set(m.name, n);
    const kgMatch = m.specification.match(/[\d.]+\s*kg/i);
    m.name = `${m.name} ${kgMatch ? `(${kgMatch[0].replace(/\s+/g, "")})` : `#${n}`}`;
  }

  console.log(`Parsed ${mapped.length} catalog rows.`);

  // Ensure warehouse locations exist (materials-admin flows expect at least one).
  for (const whName of ["Main Warehouse", "Warehouse 2"]) {
    await prisma.location.upsert({
      where: { id: `${COMPANY_ID}-${whName.replace(/\s+/g, "-").toLowerCase()}` },
      update: {},
      create: {
        id: `${COMPANY_ID}-${whName.replace(/\s+/g, "-").toLowerCase()}`,
        companyId: COMPANY_ID,
        type: "WAREHOUSE",
        name: whName,
      },
    });
  }
  console.log("Warehouse locations ensured.");

  const existing = await prisma.item.findMany({
    where: { companyId: COMPANY_ID },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((i) => i.name));

  let created = 0;
  let skipped = 0;
  for (const m of mapped) {
    if (existingNames.has(m.name)) {
      skipped++;
      continue;
    }
    const item = await prisma.item.create({
      data: {
        companyId: COMPANY_ID,
        name: m.name,
        category: m.category,
        unit: "nos",
        specification: m.specification,
        reorderLevel: new Decimal(0).toFixed(3),
        purchasePrice: m.purchasePrice != null ? new Decimal(m.purchasePrice).toFixed(2) : null,
      },
    });
    await logAudit(ctx, { action: "CREATE", entity: "Item", entityId: item.id, after: { name: m.name, category: m.category, source: "MATERIAL LIST.xlsx import" } });
    existingNames.add(m.name);
    created++;
  }

  console.log(`Created ${created} items, skipped ${skipped} already-existing.`);

  const byCategory = await prisma.item.groupBy({
    by: ["category"],
    where: { companyId: COMPANY_ID },
    _count: true,
  });
  console.log("Item counts by category:", byCategory);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

/**
 * One-time backfill: populate `Item.catalogFreight`/`catalogLoadingCharges` for the
 * 129 items originally imported from `MATERIAL LIST.xlsx` (see
 * import-vendor-material-list.ts) — these two columns were parsed but discarded in
 * that first pass. Reference-only (vendor's own catalog quote), NOT what any real
 * PO actually paid — see materials.ts itemLedger's poHistory for that.
 *
 * Reconstructs the exact same item `name` the original import produced (same
 * TYPE_MAP + disambiguation logic) to match rows to existing Item records by name.
 * Idempotent: only sets fields that are currently null.
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
  unknown,
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
  const rows = xlsx.utils.sheet_to_json<Row>(sheet, { header: 1 }).slice(1);

  type Mapped = { name: string; specification: string; freight: number | null; loading: number | null };
  const mapped: Mapped[] = [];

  for (const r of rows) {
    const typeRaw = norm(r[1]);
    const makeRaw = norm(r[2]);
    const modelRaw = r[3] == null ? "" : norm(String(r[3]));
    const specRaw = norm(r[4]);
    const freight = typeof r[6] === "number" ? r[6] : null;
    const loading = typeof r[7] === "number" ? r[7] : null;
    if (!typeRaw || !makeRaw) continue;

    const typeInfo = TYPE_MAP[typeRaw.toUpperCase()];
    if (!typeInfo) throw new Error(`Unmapped item type: "${typeRaw}"`);

    const modelStartsWithMake = modelRaw.toUpperCase().startsWith(makeRaw.toUpperCase());
    const name = norm(`${typeInfo.label} ${modelStartsWithMake ? "" : makeRaw} ${modelRaw}`);
    const specification = specRaw ? `${specRaw} — Make: ${makeRaw}` : `Make: ${makeRaw}`;

    mapped.push({ name, specification, freight, loading });
  }

  // Same disambiguation as the original import (name collisions → append a kg token).
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

  const items = await prisma.item.findMany({ where: { companyId: COMPANY_ID } });
  const byName = new Map(items.map((i) => [i.name, i]));

  let updated = 0;
  let alreadySet = 0;
  let notFound = 0;
  for (const m of mapped) {
    const item = byName.get(m.name);
    if (!item) {
      notFound++;
      console.warn(`No matching item for catalog row: "${m.name}"`);
      continue;
    }
    if (item.catalogFreight != null || item.catalogLoadingCharges != null) {
      alreadySet++;
      continue;
    }
    await prisma.item.update({
      where: { id: item.id },
      data: {
        catalogFreight: m.freight != null ? new Decimal(m.freight).toFixed(2) : null,
        catalogLoadingCharges: m.loading != null ? new Decimal(m.loading).toFixed(2) : null,
      },
    });
    await logAudit(ctx, {
      action: "UPDATE",
      entity: "Item",
      entityId: item.id,
      before: { catalogFreight: null },
      after: { catalogFreight: m.freight, catalogLoadingCharges: m.loading, source: "MATERIAL LIST.xlsx backfill" },
    });
    updated++;
  }

  console.log(`Updated ${updated} items, ${alreadySet} already had catalog freight/loading set, ${notFound} unmatched.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

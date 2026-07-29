import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

const COMPANY_ID = process.env.DEFAULT_COMPANY_ID ?? "green-ecocare";

// Seed passwords come from the env in production so a publicly-documented default can never
// reach a live DB. In dev they fall back to the known credentials for convenience.
const IS_PROD = process.env.NODE_ENV === "production";
const DEV_ADMIN_PW = "Admin@123";
const DEV_EMPLOYEE_PW = "Employee@123";
function seedPassword(envVar: string, devDefault: string): string {
  const v = process.env[envVar];
  if (IS_PROD && (!v || v === devDefault)) {
    throw new Error(
      `Refusing to seed a production DB with the public default password. Set ${envVar} to a strong value before running db:seed.`,
    );
  }
  return v || devDefault;
}
const ITEM_CATEGORIES = [
  "Plumbing",
  "Civil",
  "PumpsMotors",
  "Blowers",
  "Electrical",
  "MediaConsumables",
  "Tools",
];

async function main() {
  console.log("Seeding GreenEco CRM…");

  // --- Tenant (companyId on every model refers to this row) ---
  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {},
    create: {
      id: COMPANY_ID,
      name: "Green Ecocare Pvt Ltd",
      gstin: process.env.COMPANY_GSTIN || null,
      stateCode: process.env.COMPANY_STATE_CODE || "33",
    },
  });

  // --- Dev users (dev-shim auth signs in as one of these) ---
  // NOTE: `update` deliberately does NOT reset passwordHash — re-running the seed must not clobber
  // a password an admin has since rotated (previously it reset it back to the constant every run).
  const adminHash = hashPassword(seedPassword("SEED_ADMIN_PASSWORD", DEV_ADMIN_PW));
  const employeeHash = hashPassword(seedPassword("SEED_EMPLOYEE_PASSWORD", DEV_EMPLOYEE_PW));
  await prisma.user.upsert({
    where: { id: "dev-admin" },
    update: { email: "admin@greeneco.in" },
    create: {
      id: "dev-admin",
      companyId: COMPANY_ID,
      name: "Dev Admin (Owner)",
      phone: "9600759304",
      email: "admin@greeneco.in",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  await prisma.user.upsert({
    where: { id: "dev-employee" },
    update: { email: "employee@greeneco.in" },
    create: {
      id: "dev-employee",
      companyId: COMPANY_ID,
      name: "Dev Employee (Field)",
      phone: "9600700000",
      email: "employee@greeneco.in",
      passwordHash: employeeHash,
      role: "EMPLOYEE",
    },
  });

  // --- Warehouses (spec §10) ---
  for (const name of ["Main Warehouse", "Warehouse 2"]) {
    const existing = await prisma.location.findFirst({
      where: { companyId: COMPANY_ID, type: "WAREHOUSE", name },
    });
    if (!existing) {
      await prisma.location.create({
        data: { companyId: COMPANY_ID, type: "WAREHOUSE", name },
      });
    }
  }

  // Deliberately no sample items/vendors/leads here — this is a real client's production
  // tenant, not a demo. The Item catalog is populated from the client's own vendor price
  // list (see scripts/import-vendor-material-list.ts); leads/vendors/orders are created by
  // the client through the app itself. Seeding fake business data would show up as real
  // rows on a live customer's dashboard the first time they log in.

  console.log("Item categories:", ITEM_CATEGORIES.join(", "));
  console.log("Seed complete ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

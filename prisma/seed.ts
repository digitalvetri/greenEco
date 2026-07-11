import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPANY_ID = process.env.DEFAULT_COMPANY_ID ?? "green-ecocare";
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
  await prisma.user.upsert({
    where: { id: "dev-admin" },
    update: {},
    create: {
      id: "dev-admin",
      companyId: COMPANY_ID,
      name: "Dev Admin (Owner)",
      phone: "9600759304",
      role: "ADMIN",
    },
  });
  await prisma.user.upsert({
    where: { id: "dev-employee" },
    update: {},
    create: {
      id: "dev-employee",
      companyId: COMPANY_ID,
      name: "Dev Employee (Field)",
      phone: "9600700000",
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

  // --- Sample item master (admin-priced) ---
  const items = [
    { name: "Air Blower 2HP", category: "Blowers", unit: "nos", reorderLevel: 2, purchasePrice: 34000 },
    { name: "MBBR Media K1", category: "MediaConsumables", unit: "cum", reorderLevel: 3, purchasePrice: 26000 },
    { name: "UPVC Pipe 110mm", category: "Plumbing", unit: "m", reorderLevel: 50, purchasePrice: 210 },
    { name: "Submersible Pump 1HP", category: "PumpsMotors", unit: "nos", reorderLevel: 1, purchasePrice: 8200 },
    { name: "Control Panel MCB Set", category: "Electrical", unit: "nos", reorderLevel: 2, purchasePrice: 4500 },
  ];
  for (const it of items) {
    const existing = await prisma.item.findFirst({
      where: { companyId: COMPANY_ID, name: it.name },
    });
    if (!existing) {
      await prisma.item.create({ data: { companyId: COMPANY_ID, ...it } });
    }
  }

  // --- Sample vendors ---
  const vendors = [
    { name: "Coimbatore Pumps & Motors", categories: ["PumpsMotors", "Blowers"], phone: "9843012345", gstin: "33AAACV1234A1Z0" },
    { name: "TN Media Suppliers", categories: ["MediaConsumables"], phone: "9843054321", gstin: "33AAACM5678B1Z9" },
    { name: "Sri Electricals", categories: ["Electrical"], phone: "9842011111", gstin: "33AAACS4321C1Z1" },
  ];
  for (const v of vendors) {
    const existing = await prisma.vendor.findFirst({
      where: { companyId: COMPANY_ID, name: v.name },
    });
    if (!existing) {
      await prisma.vendor.create({ data: { companyId: COMPANY_ID, ...v } });
    }
  }

  // --- A sample lead so the app has something to show ---
  const existingLead = await prisma.lead.findFirst({
    where: { companyId: COMPANY_ID, phone: "9791234567" },
  });
  if (!existingLead) {
    await prisma.lead.create({
      data: {
        companyId: COMPANY_ID,
        customerName: "Green Meadows Apartments Assn.",
        address: "Saravanampatti, Coimbatore",
        phone: "9791234567",
        email: "secretary@greenmeadows.example",
        source: "Reference",
        requirement: "STP 40 KLD for residential complex, MBBR",
        status: "IN_FOLLOWUP",
        assignedToId: "dev-admin",
        createdById: "dev-admin",
        contacts: {
          create: [{ name: "Mr. Ramesh", designation: "Association Secretary", mobile: "9791234567" }],
        },
        followUps: {
          create: [
            {
              type: "SITE_VISIT",
              notes: "Visited site. Space available behind block C. Interested, needs budget.",
              outcome: "INTERESTED",
              nextDate: new Date(Date.now() + 3 * 86_400_000),
              createdById: "dev-admin",
            },
          ],
        },
      },
    });
  }

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

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "address" TEXT,
ADD COLUMN     "autoApproveLimit" INTEGER,
ADD COLUMN     "budgetAlertPct" INTEGER[],
ADD COLUMN     "invoicePrefix" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "lowStockMultiplier" DECIMAL(5,2),
ADD COLUMN     "minMarginPct" DECIMAL(5,4),
ADD COLUMN     "orderPrefix" TEXT,
ADD COLUMN     "poPrefix" TEXT,
ADD COLUMN     "proposalPrefix" TEXT;

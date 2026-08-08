-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "capacityUnit" TEXT,
ADD COLUMN     "capacityValue" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "capacityUnit" TEXT NOT NULL DEFAULT 'KLD',
ADD COLUMN     "capacityValue" DOUBLE PRECISION;

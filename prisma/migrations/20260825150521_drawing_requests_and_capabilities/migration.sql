-- Drawing gains companyId (NOT NULL) and a nullable orderId.
--
-- Prisma's generated version was `ADD COLUMN "companyId" TEXT NOT NULL`, which FAILS
-- on any table that already holds rows. Rewritten as the safe three-step: add it
-- nullable, backfill every existing drawing from the order it already belongs to, then
-- enforce NOT NULL. Purely additive — no drawing is read, moved or deleted, and the
-- backfill cannot orphan a row because orderId was NOT NULL before this migration.

-- CreateEnum
CREATE TYPE "DrawingRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DELIVERED', 'CHANGES_REQUESTED', 'COMPLETED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "Drawing" DROP CONSTRAINT "Drawing_orderId_fkey";

-- AlterTable
ALTER TABLE "Drawing" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "requestId" TEXT;

-- Backfill companyId from each drawing's existing order (orderId was NOT NULL until now).
UPDATE "Drawing" d
SET "companyId" = o."companyId"
FROM "Order" o
WHERE d."orderId" = o."id" AND d."companyId" IS NULL;

-- Belt and braces: if any row somehow still has no companyId, fail loudly here rather
-- than let the NOT NULL below abort with an opaque constraint error.
DO $$
DECLARE orphans INT;
BEGIN
  SELECT COUNT(*) INTO orphans FROM "Drawing" WHERE "companyId" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'Cannot migrate: % Drawing row(s) have no resolvable companyId', orphans;
  END IF;
END $$;

ALTER TABLE "Drawing" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Drawing" ALTER COLUMN "orderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "DrawingRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "purpose" TEXT,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "DrawingRequestStatus" NOT NULL DEFAULT 'OPEN',
    "changeReason" TEXT,
    "assignedToId" TEXT,
    "requestedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DrawingRequest_companyId_status_idx" ON "DrawingRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "DrawingRequest_companyId_requestedById_idx" ON "DrawingRequest"("companyId", "requestedById");

-- CreateIndex
CREATE INDEX "DrawingRequest_companyId_assignedToId_idx" ON "DrawingRequest"("companyId", "assignedToId");

-- CreateIndex
CREATE INDEX "DrawingRequest_orderId_idx" ON "DrawingRequest"("orderId");

-- CreateIndex
CREATE INDEX "DrawingRequest_leadId_idx" ON "DrawingRequest"("leadId");

-- CreateIndex
CREATE INDEX "Drawing_companyId_title_idx" ON "Drawing"("companyId", "title");

-- CreateIndex
CREATE INDEX "Drawing_requestId_idx" ON "Drawing"("requestId");

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DrawingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingRequest" ADD CONSTRAINT "DrawingRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingRequest" ADD CONSTRAINT "DrawingRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

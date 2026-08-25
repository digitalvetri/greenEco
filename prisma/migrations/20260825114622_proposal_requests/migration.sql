-- CreateEnum
CREATE TYPE "ProposalRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'FULFILLED');

-- DropIndex
DROP INDEX "Proposal_leadId_key";

-- CreateTable
CREATE TABLE "ProposalRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "proposalType" TEXT NOT NULL,
    "technology" TEXT,
    "plantType" TEXT,
    "capacityValue" DOUBLE PRECISION,
    "capacityUnit" TEXT NOT NULL DEFAULT 'KLD',
    "notes" TEXT,
    "status" "ProposalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "proposalId" TEXT,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalRequest_companyId_status_idx" ON "ProposalRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "ProposalRequest_leadId_idx" ON "ProposalRequest"("leadId");

-- CreateIndex
CREATE INDEX "ProposalRequest_companyId_requestedById_idx" ON "ProposalRequest"("companyId", "requestedById");

-- CreateIndex
CREATE INDEX "Proposal_leadId_idx" ON "Proposal"("leadId");

-- AddForeignKey
ALTER TABLE "ProposalRequest" ADD CONSTRAINT "ProposalRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRequest" ADD CONSTRAINT "ProposalRequest_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

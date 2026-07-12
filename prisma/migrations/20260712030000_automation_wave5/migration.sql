-- Automation Wave 5 (A14 win/loss learning loop)
CREATE TABLE "ProposalOutcome" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "capacityKLD" DOUBLE PRECISION NOT NULL,
    "plantType" TEXT NOT NULL,
    "technology" TEXT NOT NULL,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "marginPct" DOUBLE PRECISION,
    "boqSnapshot" JSONB,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProposalOutcome_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProposalOutcome_proposalId_key" ON "ProposalOutcome"("proposalId");
CREATE INDEX "ProposalOutcome_companyId_plantType_idx" ON "ProposalOutcome"("companyId", "plantType");
CREATE INDEX "ProposalOutcome_companyId_outcome_idx" ON "ProposalOutcome"("companyId", "outcome");

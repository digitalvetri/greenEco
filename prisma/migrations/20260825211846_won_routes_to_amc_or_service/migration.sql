-- Winning an AMC/Service proposal now creates a ServiceContract/ServiceTicket instead
-- of a project Order, so both need a link back to the proposal they came from, and a
-- ticket needs somewhere to carry the job's value. All three columns are nullable and
-- purely additive — no existing contract, ticket or order row is read or changed.
--
-- The UNIQUE on proposalId is safe on a populated table: every existing row gets NULL,
-- and Postgres permits unlimited NULLs in a unique index.

-- AlterTable
ALTER TABLE "ServiceContract" ADD COLUMN     "proposalId" TEXT;

-- AlterTable
ALTER TABLE "ServiceTicket" ADD COLUMN     "proposalId" TEXT,
ADD COLUMN     "value" DECIMAL(14,2);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContract_proposalId_key" ON "ServiceContract"("proposalId");

-- CreateIndex
CREATE INDEX "ServiceContract_proposalId_idx" ON "ServiceContract"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTicket_proposalId_key" ON "ServiceTicket"("proposalId");

-- CreateIndex
CREATE INDEX "ServiceTicket_proposalId_idx" ON "ServiceTicket"("proposalId");


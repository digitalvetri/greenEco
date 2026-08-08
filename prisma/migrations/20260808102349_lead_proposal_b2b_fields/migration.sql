-- AlterTable
ALTER TABLE "ContactPerson" ADD COLUMN     "email" TEXT,
ADD COLUMN     "location" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "branchOffices" JSONB,
ADD COLUMN     "howMet" TEXT,
ADD COLUMN     "leadType" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "contactPersonId" TEXT,
ADD COLUMN     "projectCategory" TEXT,
ADD COLUMN     "proposalType" TEXT;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_contactPersonId_fkey" FOREIGN KEY ("contactPersonId") REFERENCES "ContactPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

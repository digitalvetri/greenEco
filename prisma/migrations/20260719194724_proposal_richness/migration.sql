-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "standardTermsTemplate" TEXT;

-- AlterTable
ALTER TABLE "ProposalVersion" ADD COLUMN     "coverLetter" TEXT,
ADD COLUMN     "electricalLoad" JSONB,
ADD COLUMN     "pointsToNote" TEXT,
ADD COLUMN     "technicalSpecs" JSONB,
ADD COLUMN     "technologyExplainer" TEXT;

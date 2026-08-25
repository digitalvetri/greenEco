-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "docCivilDesign" TEXT,
ADD COLUMN     "docIntroduction" TEXT,
ADD COLUMN     "docMepDesign" TEXT,
ADD COLUMN     "docPlantAbout" TEXT,
ADD COLUMN     "docPointsToNote" TEXT,
ADD COLUMN     "docRecentProjects" JSONB,
ADD COLUMN     "docScopeClient" TEXT,
ADD COLUMN     "docScopeGreenEcocare" TEXT,
ADD COLUMN     "docSignatoryName" TEXT,
ADD COLUMN     "docSignatoryPhone" TEXT,
ADD COLUMN     "docSignatoryTitle" TEXT,
ADD COLUMN     "docSupplyErection" TEXT,
ADD COLUMN     "docTaxesDuties" TEXT,
ADD COLUMN     "docWarranty" TEXT;

-- AlterTable
ALTER TABLE "ProposalVersion" ADD COLUMN     "documentData" JSONB;

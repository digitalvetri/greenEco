-- AlterTable
ALTER TABLE "Communication" ADD COLUMN     "contractId" TEXT;

-- CreateIndex
CREATE INDEX "Communication_contractId_idx" ON "Communication"("contractId");

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

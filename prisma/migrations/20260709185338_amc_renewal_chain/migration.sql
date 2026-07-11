-- AlterTable
ALTER TABLE "ServiceContract" ADD COLUMN     "renewedFromId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceContract_renewedFromId_idx" ON "ServiceContract"("renewedFromId");

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Communication" ADD COLUMN     "orderId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Communication_orderId_idx" ON "Communication"("orderId");

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

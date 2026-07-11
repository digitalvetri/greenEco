-- Structured credit-note → original link (was a text ref inside the description)
ALTER TABLE "Invoice" ADD COLUMN "creditNoteOfId" TEXT;
CREATE INDEX "Invoice_creditNoteOfId_idx" ON "Invoice"("creditNoteOfId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_creditNoteOfId_fkey" FOREIGN KEY ("creditNoteOfId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

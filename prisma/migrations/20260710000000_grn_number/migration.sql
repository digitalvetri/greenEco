-- Add sequential GRN number (nullable: pre-numbering GRNs stay null)
ALTER TABLE "GRN" ADD COLUMN "grnNo" TEXT;
CREATE UNIQUE INDEX "GRN_grnNo_key" ON "GRN"("grnNo");

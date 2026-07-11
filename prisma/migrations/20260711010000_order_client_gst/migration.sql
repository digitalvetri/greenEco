-- Customer place-of-supply state + GSTIN for correct IGST vs CGST/SGST + B2B tax invoice
ALTER TABLE "Order" ADD COLUMN "clientStateCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "clientGstin" TEXT;

-- Enforce at most one credit note per original invoice at the database level.
-- The application-layer guard (findFirst + throw) already prevents duplicates,
-- but this @unique constraint makes it impossible even under concurrent writes.
--
-- Before applying: verify no duplicates exist in production data:
--   SELECT "creditNoteOfId", COUNT(*) FROM "Invoice"
--   WHERE "creditNoteOfId" IS NOT NULL
--   GROUP BY "creditNoteOfId" HAVING COUNT(*) > 1;
-- If any rows are returned, resolve them before running this migration.

-- Drop the old plain index (replaced by the unique constraint below).
DROP INDEX IF EXISTS "Invoice_creditNoteOfId_idx";

-- Add the unique constraint (also serves as an index).
CREATE UNIQUE INDEX "Invoice_creditNoteOfId_key" ON "Invoice"("creditNoteOfId");

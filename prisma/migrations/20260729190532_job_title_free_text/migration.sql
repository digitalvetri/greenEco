-- AlterTable
-- Cast in place (not drop+add) so existing jobTitle values (e.g. 'MD', 'SALES') survive
-- the enum -> free-text change instead of being nulled out.
ALTER TABLE "User" ALTER COLUMN "jobTitle" TYPE TEXT USING ("jobTitle"::text);

-- DropEnum
DROP TYPE "JobTitle";

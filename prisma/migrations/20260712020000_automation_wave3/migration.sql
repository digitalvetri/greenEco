-- Automation Wave 3 (A10 bill vision): store the Claude-vision extract + match verdict
ALTER TABLE "ErectionEntry" ADD COLUMN "aiExtract" JSONB;
ALTER TABLE "ErectionEntry" ADD COLUMN "aiMatch" TEXT;

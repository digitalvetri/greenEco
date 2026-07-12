-- Automation Wave 2 (money): client phone for reminders + invoice draft/issued status

ALTER TABLE "Order" ADD COLUMN "clientPhone" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ISSUED';

-- Backfill client phone from the order's proposal -> lead.
UPDATE "Order" o
SET "clientPhone" = l."phone"
FROM "Proposal" p
JOIN "Lead" l ON l."id" = p."leadId"
WHERE o."proposalId" = p."id" AND o."clientPhone" IS NULL;

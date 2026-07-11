import { randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { formatDocNumber, type DocKind } from "@/lib/domain/numbering";
import { env } from "@/lib/env";

type Db = PrismaClient | Prisma.TransactionClient;

const PREFIX: Record<DocKind, string> = {
  INVOICE: env.invoicePrefix,
  ORDER: env.orderPrefix,
  PROPOSAL: env.proposalPrefix,
  PO: env.poPrefix,
  AMC: env.amcPrefix,
  TICKET: env.ticketPrefix,
  GRN: env.grnPrefix,
};

/**
 * Allocate the next sequential document number atomically. The Postgres
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING is race-free even under
 * concurrent allocation — numbers are never reused (spec §7.3).
 * Call inside the same $transaction that creates the document.
 */
export async function allocateNumber(
  db: Db,
  companyId: string,
  kind: DocKind,
  year: number,
): Promise<string> {
  const rows = await db.$queryRaw<Array<{ lastValue: number }>>`
    INSERT INTO "NumberSequence" ("id", "companyId", "kind", "year", "lastValue")
    VALUES (${randomUUID()}, ${companyId}, ${kind}, ${year}, 1)
    ON CONFLICT ("companyId", "kind", "year")
    DO UPDATE SET "lastValue" = "NumberSequence"."lastValue" + 1
    RETURNING "lastValue";
  `;
  const seq = rows[0].lastValue;
  return formatDocNumber(PREFIX[kind], year, seq);
}

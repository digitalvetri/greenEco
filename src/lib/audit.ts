import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import type { Ctx } from "./rbac";

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VIEW_PRICE"
  | "APPROVE"
  | "EXPORT";

export interface AuditInput {
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/** Append an AuditLog row (spec §6 — AuditLog middleware on all mutations). */
export async function logAudit(ctx: Ctx, input: AuditInput, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: (input.before ?? undefined) as Prisma.InputJsonValue,
      after: (input.after ?? undefined) as Prisma.InputJsonValue,
    },
  });
}

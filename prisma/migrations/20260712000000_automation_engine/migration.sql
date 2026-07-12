-- Automation Engine (AUTOMATION-ENGINE-SPEC-v1.0)

CREATE TABLE "AutomationLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomationLog_dedupeKey_key" ON "AutomationLog"("dedupeKey");
CREATE INDEX "AutomationLog_companyId_name_createdAt_idx" ON "AutomationLog"("companyId", "name", "createdAt");

CREATE TABLE "AutomationSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    CONSTRAINT "AutomationSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomationSetting_companyId_key_key" ON "AutomationSetting"("companyId", "key");

CREATE TABLE "AutomationTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AutomationTask_companyId_assigneeId_status_idx" ON "AutomationTask"("companyId", "assigneeId", "status");
CREATE INDEX "AutomationTask_companyId_type_entityId_idx" ON "AutomationTask"("companyId", "type", "entityId");

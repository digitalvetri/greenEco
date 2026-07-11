-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('UPCOMING', 'DUE', 'DONE', 'MISSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "ServiceContract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "orderId" TEXT,
    "clientName" TEXT NOT NULL,
    "siteAddress" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "annualValue" DECIMAL(14,2) NOT NULL,
    "frequency" "ServiceFrequency" NOT NULL DEFAULT 'QUARTERLY',
    "visitsPerYear" INTEGER NOT NULL DEFAULT 4,
    "scope" JSONB NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceVisit" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "actualDate" TIMESTAMP(3),
    "status" "VisitStatus" NOT NULL DEFAULT 'UPCOMING',
    "checklist" JSONB,
    "readings" JSONB,
    "notes" TEXT,
    "photos" JSONB,
    "technicianId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "contractId" TEXT,
    "orderId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "raisedBy" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "slaDueDate" TIMESTAMP(3),
    "resolution" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContract_contractNo_key" ON "ServiceContract"("contractNo");

-- CreateIndex
CREATE INDEX "ServiceContract_companyId_status_idx" ON "ServiceContract"("companyId", "status");

-- CreateIndex
CREATE INDEX "ServiceContract_endDate_idx" ON "ServiceContract"("endDate");

-- CreateIndex
CREATE INDEX "MaintenanceVisit_contractId_idx" ON "MaintenanceVisit"("contractId");

-- CreateIndex
CREATE INDEX "MaintenanceVisit_scheduledDate_status_idx" ON "MaintenanceVisit"("scheduledDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTicket_ticketNo_key" ON "ServiceTicket"("ticketNo");

-- CreateIndex
CREATE INDEX "ServiceTicket_companyId_status_idx" ON "ServiceTicket"("companyId", "status");

-- CreateIndex
CREATE INDEX "ServiceTicket_slaDueDate_idx" ON "ServiceTicket"("slaDueDate");

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceVisit" ADD CONSTRAINT "MaintenanceVisit_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

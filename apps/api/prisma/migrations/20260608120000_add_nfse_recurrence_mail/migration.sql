-- CreateEnum
CREATE TYPE "NfseRecurrenceFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "NfseRecurrenceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FINISHED');

-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "NfseRecurrence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT,
    "frequency" "NfseRecurrenceFrequency" NOT NULL DEFAULT 'MONTHLY',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "NfseRecurrenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "amount" DECIMAL(15,2) NOT NULL,
    "issRate" DECIMAL(8,4),
    "issWithheld" BOOLEAN NOT NULL DEFAULT false,
    "serviceDescription" TEXT NOT NULL,
    "nationalTaxCode" TEXT,
    "municipalServiceCode" TEXT,
    "municipalIbgeCode" TEXT,
    "additionalInformation" TEXT,
    "lastInvoiceId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfseRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfseMailLog" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "MailStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfseMailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NfseRecurrence_companyId_status_nextRunAt_idx" ON "NfseRecurrence"("companyId", "status", "nextRunAt");

-- CreateIndex
CREATE INDEX "NfseRecurrence_customerId_idx" ON "NfseRecurrence"("customerId");

-- CreateIndex
CREATE INDEX "NfseRecurrence_serviceId_idx" ON "NfseRecurrence"("serviceId");

-- CreateIndex
CREATE INDEX "NfseRecurrence_lastInvoiceId_idx" ON "NfseRecurrence"("lastInvoiceId");

-- CreateIndex
CREATE INDEX "NfseMailLog_invoiceId_idx" ON "NfseMailLog"("invoiceId");

-- CreateIndex
CREATE INDEX "NfseMailLog_status_idx" ON "NfseMailLog"("status");

-- AddForeignKey
ALTER TABLE "NfseRecurrence" ADD CONSTRAINT "NfseRecurrence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfseRecurrence" ADD CONSTRAINT "NfseRecurrence_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfseRecurrence" ADD CONSTRAINT "NfseRecurrence_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "NfseService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfseRecurrence" ADD CONSTRAINT "NfseRecurrence_lastInvoiceId_fkey" FOREIGN KEY ("lastInvoiceId") REFERENCES "NfseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfseMailLog" ADD CONSTRAINT "NfseMailLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "NfseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingFile" ALTER COLUMN "recordId" DROP NOT NULL;
ALTER TABLE "AccountingFile" ADD COLUMN "companyId" TEXT;
ALTER TABLE "AccountingFile" ADD COLUMN "area" TEXT;
ALTER TABLE "AccountingFile" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'INBOUND';
CREATE INDEX "AccountingFile_companyId_area_idx" ON "AccountingFile"("companyId", "area");
CREATE INDEX "AccountingFile_companyId_provider_externalId_idx" ON "AccountingFile"("companyId", "provider", "externalId");

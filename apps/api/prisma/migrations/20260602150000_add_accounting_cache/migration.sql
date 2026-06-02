-- CreateTable
CREATE TABLE "AccountingRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ACESSORIAS',
    "area" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT,
    "department" TEXT,
    "dueDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "updatedExternalAt" TIMESTAMP(3),
    "payload" JSONB,
    "normalized" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingFile" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ACESSORIAS',
    "externalId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sizeBytes" INTEGER,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingSync" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ACESSORIAS',
    "area" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastResultCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingRecord_companyId_provider_area_externalId_key" ON "AccountingRecord"("companyId", "provider", "area", "externalId");

-- CreateIndex
CREATE INDEX "AccountingRecord_companyId_area_status_idx" ON "AccountingRecord"("companyId", "area", "status");

-- CreateIndex
CREATE INDEX "AccountingRecord_companyId_area_dueDate_idx" ON "AccountingRecord"("companyId", "area", "dueDate");

-- CreateIndex
CREATE INDEX "AccountingFile_recordId_idx" ON "AccountingFile"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSync_companyId_provider_area_key" ON "AccountingSync"("companyId", "provider", "area");

-- AddForeignKey
ALTER TABLE "AccountingRecord" ADD CONSTRAINT "AccountingRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingFile" ADD CONSTRAINT "AccountingFile_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AccountingRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSync" ADD CONSTRAINT "AccountingSync_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

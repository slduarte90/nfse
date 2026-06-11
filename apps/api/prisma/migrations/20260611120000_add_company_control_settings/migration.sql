-- CreateTable
CREATE TABLE "CompanyControlSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "indicatorApiKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyControlSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyControlSettings_companyId_key" ON "CompanyControlSettings"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyControlSettings" ADD CONSTRAINT "CompanyControlSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

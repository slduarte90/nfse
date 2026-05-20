-- CreateEnum
CREATE TYPE "NfseEnvironment" AS ENUM ('PRODUCTION_RESTRICTED', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "NfseTaxRegime" AS ENUM ('NONE', 'MEI', 'SIMPLE_NATIONAL', 'NORMAL', 'SPECIAL');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "complement" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'Brasil',
ADD COLUMN     "foreignDocument" TEXT,
ADD COLUMN     "isForeign" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "municipalRegistration" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "stateRegistration" TEXT,
ADD COLUMN     "zipCode" TEXT;

-- AlterTable
ALTER TABLE "NfseInvoice" ADD COLUMN     "additionalInformation" TEXT,
ADD COLUMN     "deductions" DECIMAL(12,2),
ADD COLUMN     "discounts" DECIMAL(12,2),
ADD COLUMN     "dpsId" TEXT,
ADD COLUMN     "issAmount" DECIMAL(12,2),
ADD COLUMN     "issRate" DECIMAL(5,2),
ADD COLUMN     "issWithheld" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "municipalIbgeCode" TEXT,
ADD COLUMN     "municipalServiceCode" TEXT,
ADD COLUMN     "nationalTaxCode" TEXT,
ADD COLUMN     "operationNature" TEXT,
ADD COLUMN     "rpsNumber" TEXT,
ADD COLUMN     "rpsSeries" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- CreateTable
CREATE TABLE "NfseSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "environment" "NfseEnvironment" NOT NULL DEFAULT 'PRODUCTION_RESTRICTED',
    "apiBaseUrl" TEXT,
    "apiVersion" TEXT,
    "municipalIbgeCode" TEXT,
    "municipalRegistration" TEXT,
    "taxRegime" "NfseTaxRegime" NOT NULL DEFAULT 'NORMAL',
    "specialTaxRegime" TEXT,
    "isSimpleNational" BOOLEAN NOT NULL DEFAULT false,
    "hasFiscalIncentive" BOOLEAN NOT NULL DEFAULT false,
    "defaultIssWithheld" BOOLEAN NOT NULL DEFAULT false,
    "defaultOperationNature" TEXT,
    "defaultRpsSeries" TEXT,
    "certificateId" TEXT,
    "lastCertificateValidated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfseSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfseService" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cnae" TEXT,
    "nationalTaxCode" TEXT NOT NULL,
    "municipalServiceCode" TEXT,
    "cityServiceCode" TEXT,
    "issRate" DECIMAL(5,2),
    "isIssWithheld" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfseService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NfseSettings_companyId_key" ON "NfseSettings"("companyId");

-- CreateIndex
CREATE INDEX "NfseSettings_companyId_environment_idx" ON "NfseSettings"("companyId", "environment");

-- CreateIndex
CREATE INDEX "NfseService_companyId_isActive_idx" ON "NfseService"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "NfseService_companyId_cnae_idx" ON "NfseService"("companyId", "cnae");

-- CreateIndex
CREATE INDEX "Customer_companyId_name_idx" ON "Customer"("companyId", "name");

-- CreateIndex
CREATE INDEX "NfseInvoice_companyId_status_idx" ON "NfseInvoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "NfseInvoice_companyId_number_idx" ON "NfseInvoice"("companyId", "number");

-- CreateIndex
CREATE INDEX "NfseInvoice_companyId_accessKey_idx" ON "NfseInvoice"("companyId", "accessKey");

-- CreateIndex
CREATE INDEX "NfseInvoice_customerId_idx" ON "NfseInvoice"("customerId");

-- AddForeignKey
ALTER TABLE "NfseSettings" ADD CONSTRAINT "NfseSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfseService" ADD CONSTRAINT "NfseService_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfseInvoice" ADD CONSTRAINT "NfseInvoice_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "NfseService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

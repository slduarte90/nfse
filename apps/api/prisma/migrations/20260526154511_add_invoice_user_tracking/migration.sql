-- AlterTable
ALTER TABLE "NfseInvoice" ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "transmittedByName" TEXT,
ADD COLUMN     "transmittedByUserId" TEXT,
ADD COLUMN     "updatedByName" TEXT,
ADD COLUMN     "updatedByUserId" TEXT;

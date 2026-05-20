-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "address" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'Brasil',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "legalNature" TEXT,
ADD COLUMN     "mainActivity" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "registrationStatus" TEXT,
ADD COLUMN     "zipCode" TEXT;

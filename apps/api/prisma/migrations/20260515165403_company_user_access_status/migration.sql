-- CreateEnum
CREATE TYPE "CompanyUserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'DISABLED');

-- AlterTable
ALTER TABLE "CompanyUser" ADD COLUMN     "status" "CompanyUserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ControlIndicatorSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "period" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlIndicatorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ControlIndicatorSnapshot_companyId_idx" ON "ControlIndicatorSnapshot"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlIndicatorSnapshot_companyId_department_key" ON "ControlIndicatorSnapshot"("companyId", "department");

-- AddForeignKey
ALTER TABLE "ControlIndicatorSnapshot" ADD CONSTRAINT "ControlIndicatorSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

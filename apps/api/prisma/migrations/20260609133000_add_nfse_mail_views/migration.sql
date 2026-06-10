-- Track NFS-e notification e-mail opens.
CREATE TABLE "NfseMailView" (
    "id" TEXT NOT NULL,
    "mailLogId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "NfseMailView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NfseMailView_mailLogId_idx" ON "NfseMailView"("mailLogId");
CREATE INDEX "NfseMailView_viewedAt_idx" ON "NfseMailView"("viewedAt");

ALTER TABLE "NfseMailView" ADD CONSTRAINT "NfseMailView_mailLogId_fkey" FOREIGN KEY ("mailLogId") REFERENCES "NfseMailLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

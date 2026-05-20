-- AlterTable
ALTER TABLE "UserInvitation" ADD COLUMN     "groupToken" TEXT;

-- CreateIndex
CREATE INDEX "UserInvitation_groupToken_idx" ON "UserInvitation"("groupToken");

-- CreateEnum
CREATE TYPE "MailKind" AS ENUM ('INVITE', 'RESET');

-- CreateTable
CREATE TABLE "MailSend" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "kind" "MailKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailSend_staffId_sentAt_idx" ON "MailSend"("staffId", "sentAt");

-- AddForeignKey
ALTER TABLE "MailSend" ADD CONSTRAINT "MailSend_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

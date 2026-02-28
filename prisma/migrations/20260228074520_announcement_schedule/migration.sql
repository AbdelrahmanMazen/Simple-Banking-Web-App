-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AnnouncementSchedule" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "body" TEXT,
    "bodyAr" TEXT,
    "mediaUrl" TEXT,
    "youtubeId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnouncementSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementSchedule_startsAt_idx" ON "AnnouncementSchedule"("startsAt");

-- CreateIndex
CREATE INDEX "AnnouncementSchedule_endsAt_idx" ON "AnnouncementSchedule"("endsAt");

-- CreateIndex
CREATE INDEX "AnnouncementSchedule_status_idx" ON "AnnouncementSchedule"("status");

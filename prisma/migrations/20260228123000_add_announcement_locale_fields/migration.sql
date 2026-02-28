-- Add localized Arabic fields for announcements
ALTER TABLE "Announcement" ADD COLUMN "titleAr" TEXT;
ALTER TABLE "Announcement" ADD COLUMN "bodyAr" TEXT;

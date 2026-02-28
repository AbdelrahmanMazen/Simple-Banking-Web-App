/*
  Warnings:

  - Made the column `title` on table `Announcement` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Announcement" ALTER COLUMN "title" SET NOT NULL;

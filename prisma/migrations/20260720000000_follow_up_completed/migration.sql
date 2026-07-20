-- AlterTable: mark a follow-up as done without deleting it
ALTER TABLE "FollowUp" ADD COLUMN "completedAt" TIMESTAMP(3);

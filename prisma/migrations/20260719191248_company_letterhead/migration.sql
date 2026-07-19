-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "branches" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "website" TEXT;

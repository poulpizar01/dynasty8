-- AlterTable
ALTER TABLE "comptes" ADD COLUMN     "roles_discord" TEXT[] DEFAULT ARRAY[]::TEXT[];

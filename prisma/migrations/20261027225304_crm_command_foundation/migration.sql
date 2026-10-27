-- CreateEnum
CREATE TYPE "ActivityOrigin" AS ENUM ('HUMAN', 'AGENT', 'SYSTEM');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "lastMeaningfulInteractionAt" TIMESTAMP(3),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "origin" "ActivityOrigin" NOT NULL DEFAULT 'HUMAN';

-- Preserve a useful interaction baseline for leads that already have a recorded contact.
UPDATE "Lead" AS lead
SET "lastMeaningfulInteractionAt" = latest_contact."createdAt"
FROM (
  SELECT "leadId", MAX("createdAt") AS "createdAt"
  FROM "Activity"
  WHERE "type" = 'CONTACT'
  GROUP BY "leadId"
) AS latest_contact
WHERE lead."id" = latest_contact."leadId";

-- Historical automatic activity used the shared system actor id.
UPDATE "Activity" SET "origin" = 'SYSTEM' WHERE "actorId" = '__team__';

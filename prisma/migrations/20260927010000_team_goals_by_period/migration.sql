CREATE TYPE "GoalPeriodKind" AS ENUM ('WEEKLY', 'MONTHLY');

ALTER TABLE "Goal"
ADD COLUMN "periodKind" "GoalPeriodKind" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN "periodStart" TIMESTAMP(3),
ADD COLUMN "periodEnd" TIMESTAMP(3),
ADD COLUMN "mrrTarget" DOUBLE PRECISION,
ADD COLUMN "followUpsCompletedTarget" INTEGER,
ADD COLUMN "conversionRateTarget" DOUBLE PRECISION;

UPDATE "Goal"
SET
  "periodStart" = date_trunc('week', "weekStart") + INTERVAL '3 hours';

UPDATE "Goal"
SET "periodEnd" = "periodStart" + INTERVAL '7 days';

ALTER TABLE "Goal"
ALTER COLUMN "periodStart" SET NOT NULL,
ALTER COLUMN "periodEnd" SET NOT NULL,
ALTER COLUMN "approachesTarget" DROP NOT NULL,
ALTER COLUMN "interestsTarget" DROP NOT NULL,
ALTER COLUMN "meetingsTarget" DROP NOT NULL,
ALTER COLUMN "salesTarget" DROP NOT NULL,
ALTER COLUMN "revenueTarget" DROP NOT NULL,
ALTER COLUMN "periodKind" DROP DEFAULT,
ALTER COLUMN "interestsTarget" DROP DEFAULT,
ALTER COLUMN "meetingsTarget" DROP DEFAULT,
ALTER COLUMN "salesTarget" DROP DEFAULT;

UPDATE "Goal"
SET
  "approachesTarget" = NULLIF("approachesTarget", 0),
  "interestsTarget" = NULLIF("interestsTarget", 0),
  "meetingsTarget" = NULLIF("meetingsTarget", 0),
  "salesTarget" = NULLIF("salesTarget", 0),
  "revenueTarget" = NULLIF("revenueTarget", 0);

DROP INDEX "Goal_weekStart_idx";
DROP INDEX "Goal_ownerId_weekStart_key";

ALTER TABLE "Goal" DROP COLUMN "weekStart";

CREATE UNIQUE INDEX "Goal_ownerId_periodKind_periodStart_key"
ON "Goal"("ownerId", "periodKind", "periodStart");

CREATE INDEX "Goal_periodStart_idx" ON "Goal"("periodStart");

CREATE TABLE "TeamGoalSettings" (
  "id" TEXT NOT NULL DEFAULT 'team',
  "monthlyStartDay" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamGoalSettings_pkey" PRIMARY KEY ("id")
);

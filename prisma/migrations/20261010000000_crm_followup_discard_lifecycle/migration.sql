ALTER TABLE "Lead"
  ADD COLUMN "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "postFollowUpAt" TIMESTAMP(3),
  ADD COLUMN "discardedAt" TIMESTAMP(3);

ALTER TABLE "FollowUp"
  ADD COLUMN "returnStage" "LeadStage";

UPDATE "Lead"
SET "discardedAt" = (
  SELECT MIN("StageHistory"."createdAt")
  FROM "StageHistory"
  WHERE "StageHistory"."leadId" = "Lead"."id"
    AND "StageHistory"."toStage" = 'DISCARDED'
)
WHERE EXISTS (
  SELECT 1
  FROM "StageHistory"
  WHERE "StageHistory"."leadId" = "Lead"."id"
    AND "StageHistory"."toStage" = 'DISCARDED'
);

CREATE INDEX "Lead_stage_stageEnteredAt_idx" ON "Lead"("stage", "stageEnteredAt");
CREATE INDEX "Lead_discardedAt_idx" ON "Lead"("discardedAt");

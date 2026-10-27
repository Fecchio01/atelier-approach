CREATE INDEX IF NOT EXISTS "Lead_postFollowUpAt_stage_id_idx"
ON "Lead"("postFollowUpAt", "stage", "id");

CREATE INDEX IF NOT EXISTS "Lead_stage_stageEnteredAt_id_idx"
ON "Lead"("stage", "stageEnteredAt", "id");

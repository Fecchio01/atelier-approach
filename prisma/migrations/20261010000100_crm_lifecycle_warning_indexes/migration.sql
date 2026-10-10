CREATE INDEX "Lead_postFollowUpAt_id_idx" ON "Lead"("postFollowUpAt", "id");

CREATE INDEX "FollowUp_leadId_state_completedAt_id_idx" ON "FollowUp"("leadId", "state", "completedAt", "id");

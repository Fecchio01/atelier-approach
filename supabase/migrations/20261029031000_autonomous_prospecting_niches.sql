ALTER TABLE "atelier"."AgentAutomationSettings"
  ADD COLUMN "prospectingNiches" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "atelier"."AgentAutomationSettings"
  ADD CONSTRAINT "AgentAutomationSettings_prospectingNiches_limit_check"
  CHECK (cardinality("prospectingNiches") <= 10);

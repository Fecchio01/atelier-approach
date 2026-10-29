ALTER TABLE "atelier"."AgentAutomationSettings"
  ADD COLUMN "prospectingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "prospectingDailyLimit" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "atelier"."AgentAutomationSettings"
  ADD CONSTRAINT "AgentAutomationSettings_prospectingDailyLimit_check"
  CHECK ("prospectingDailyLimit" BETWEEN 1 AND 20);

ALTER TABLE "atelier"."ProspectCandidate"
  ADD COLUMN "commercialAnalysis" JSONB,
  ADD COLUMN "analyzedAt" TIMESTAMP(3);

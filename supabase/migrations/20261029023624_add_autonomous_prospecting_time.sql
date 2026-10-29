ALTER TABLE "atelier"."AgentAutomationSettings"
  ADD COLUMN "prospectingTime" TEXT NOT NULL DEFAULT '09:00';

ALTER TABLE "atelier"."AgentAutomationSettings"
  ADD CONSTRAINT "AgentAutomationSettings_prospectingTime_format_check"
  CHECK ("prospectingTime" ~ '^(0[0-9]|1[0-9]|2[0-3]):00$');

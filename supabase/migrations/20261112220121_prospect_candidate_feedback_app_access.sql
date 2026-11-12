ALTER TABLE "atelier"."ProspectCandidateFeedback" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE "atelier"."ProspectCandidateFeedback"
  TO atelier_app;

GRANT USAGE
  ON TYPE "atelier"."ProspectFeedbackOutcome", "atelier"."ProspectFeedbackReason"
  TO atelier_app;

CREATE POLICY "ProspectCandidateFeedback_app_access"
  ON "atelier"."ProspectCandidateFeedback"
  FOR ALL TO atelier_app
  USING (true)
  WITH CHECK (true);

-- The application connects as atelier_app and needs to read and persist the
-- team-level monthly cycle settings created by the previous migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "TeamGoalSettings" TO atelier_app;
GRANT USAGE ON TYPE "GoalPeriodKind" TO atelier_app;

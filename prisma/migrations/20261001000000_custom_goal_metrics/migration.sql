ALTER TABLE "Goal"
ADD COLUMN "customGoals" JSONB NOT NULL DEFAULT '[]'::jsonb;

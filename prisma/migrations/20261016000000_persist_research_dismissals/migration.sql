CREATE TABLE "ResearchDismissal" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "osmId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResearchDismissal_ownerId_osmId_key"
ON "ResearchDismissal"("ownerId", "osmId");

CREATE INDEX "ResearchDismissal_ownerId_idx"
ON "ResearchDismissal"("ownerId");

ALTER TABLE "ResearchDismissal" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ResearchDismissal_app_access" ON "ResearchDismissal"
FOR ALL TO atelier_app
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ResearchDismissal" TO atelier_app;

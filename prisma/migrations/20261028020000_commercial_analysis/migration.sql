ALTER TABLE "atelier"."ServiceCatalogItem"
  ADD COLUMN "scope" TEXT,
  ADD COLUMN "deliverables" TEXT,
  ADD COLUMN "restrictions" TEXT;

CREATE TABLE "atelier"."CompanyAnalysis" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "leadVersion" INTEGER NOT NULL,
  "evidenceFingerprint" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyAnalysis_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyAnalysis_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "atelier"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompanyAnalysis_leadId_evidenceFingerprint_key" ON "atelier"."CompanyAnalysis"("leadId", "evidenceFingerprint");
CREATE INDEX "CompanyAnalysis_leadId_createdAt_idx" ON "atelier"."CompanyAnalysis"("leadId", "createdAt");
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "atelier"."CompanyAnalysis" TO atelier_app;
ALTER TABLE "atelier"."CompanyAnalysis" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CompanyAnalysis_app_access" ON "atelier"."CompanyAnalysis" TO atelier_app USING (true) WITH CHECK (true);

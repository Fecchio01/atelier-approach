CREATE TABLE "MetricImportBatch" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MetricImportBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MetricImportBatch_period_valid" CHECK ("periodEnd" > "periodStart"),
  CONSTRAINT "MetricImportBatch_contentHash_valid" CHECK ("contentHash" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "MetricImportRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "metricKey" TEXT,
  "customGoalId" TEXT,
  "label" TEXT NOT NULL,
  "unit" TEXT,
  "value" DECIMAL(14,4) NOT NULL,
  CONSTRAINT "MetricImportRow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MetricImportRow_value_nonnegative" CHECK ("value" >= 0),
  CONSTRAINT "MetricImportRow_metric_reference_valid" CHECK (
    ("metricKey" IS NOT NULL AND "customGoalId" IS NULL AND "metricKey" IN (
      'approaches', 'interests', 'meetings', 'sales', 'revenue', 'mrr', 'followUpsCompleted', 'conversionRate'
    )) OR ("metricKey" IS NULL AND "customGoalId" IS NOT NULL)
  ),
  CONSTRAINT "MetricImportRow_batchId_fkey" FOREIGN KEY ("batchId")
    REFERENCES "MetricImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MetricImportBatch_ownerId_contentHash_periodStart_periodEnd_key"
  ON "MetricImportBatch"("ownerId", "contentHash", "periodStart", "periodEnd");
CREATE INDEX "MetricImportBatch_ownerId_periodStart_periodEnd_idx"
  ON "MetricImportBatch"("ownerId", "periodStart", "periodEnd");
CREATE INDEX "MetricImportBatch_createdAt_idx" ON "MetricImportBatch"("createdAt");
CREATE INDEX "MetricImportRow_batchId_idx" ON "MetricImportRow"("batchId");
CREATE INDEX "MetricImportRow_metricKey_idx" ON "MetricImportRow"("metricKey");
CREATE INDEX "MetricImportRow_customGoalId_idx" ON "MetricImportRow"("customGoalId");
CREATE UNIQUE INDEX "MetricImportRow_batchId_metricKey_key"
  ON "MetricImportRow"("batchId", "metricKey") WHERE "metricKey" IS NOT NULL;
CREATE UNIQUE INDEX "MetricImportRow_batchId_customGoalId_key"
  ON "MetricImportRow"("batchId", "customGoalId") WHERE "customGoalId" IS NOT NULL;

-- Imported result batches are immutable; only select, insert and delete are needed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atelier_app') THEN
    GRANT SELECT, INSERT, DELETE ON TABLE "MetricImportBatch", "MetricImportRow" TO atelier_app;
  END IF;
END $$;

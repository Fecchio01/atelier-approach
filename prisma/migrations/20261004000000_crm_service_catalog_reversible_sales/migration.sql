CREATE TYPE "ServiceBillingType" AS ENUM ('ONE_TIME', 'MONTHLY');

ALTER TABLE "SaleEvent"
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversedById" TEXT;

CREATE TABLE "ServiceCatalogItem" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "billingType" "ServiceBillingType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceCatalogItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceCatalogItem_price_nonnegative" CHECK ("price" >= 0)
);

CREATE TABLE "SaleLineItem" (
  "id" TEXT NOT NULL,
  "saleEventId" TEXT NOT NULL,
  "serviceId" TEXT,
  "serviceName" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "billingType" "ServiceBillingType" NOT NULL,
  CONSTRAINT "SaleLineItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleLineItem_price_nonnegative" CHECK ("price" >= 0),
  CONSTRAINT "SaleLineItem_saleEventId_fkey" FOREIGN KEY ("saleEventId") REFERENCES "SaleEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SaleLineItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CrmSettings" (
  "id" TEXT NOT NULL DEFAULT 'team',
  "followUpDelayDays" INTEGER NOT NULL DEFAULT 2,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmSettings_positive_delay" CHECK ("followUpDelayDays" > 0)
);

CREATE INDEX "ServiceCatalogItem_isActive_name_idx" ON "ServiceCatalogItem"("isActive", "name");
CREATE INDEX "SaleLineItem_saleEventId_idx" ON "SaleLineItem"("saleEventId");
CREATE INDEX "SaleLineItem_serviceId_idx" ON "SaleLineItem"("serviceId");
CREATE INDEX "SaleEvent_reversedAt_occurredAt_idx" ON "SaleEvent"("reversedAt", "occurredAt");

-- Reconcile historical reopenings without rewriting the sale's original snapshot.
-- A later win remains active; every sale on a currently non-won lead is reversed.
-- Where legacy data has no reopening activity, the migration time and sale actor
-- provide an explicit audit marker rather than inventing a historical timestamp.
WITH latest_reopening AS (
  SELECT DISTINCT ON ("leadId") "leadId", "createdAt", "actorId"
  FROM "Activity"
  WHERE "type" = 'LEAD_REOPENED'
  ORDER BY "leadId", "createdAt" DESC, "id" DESC
)
UPDATE "SaleEvent" AS sale
SET "reversedAt" = GREATEST(sale."occurredAt", COALESCE(reopened."createdAt", CURRENT_TIMESTAMP)),
    "reversedById" = COALESCE(reopened."actorId", sale."actorId")
FROM "Lead" AS lead
LEFT JOIN latest_reopening AS reopened ON reopened."leadId" = lead."id"
WHERE sale."leadId" = lead."id"
  AND sale."reversedAt" IS NULL
  AND (lead."stage" <> 'WON' OR sale."occurredAt" <= reopened."createdAt");

-- Follow the existing private-schema application-role grants when that role exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atelier_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ServiceCatalogItem", "SaleLineItem", "CrmSettings" TO atelier_app;
    GRANT USAGE ON TYPE "ServiceBillingType" TO atelier_app;
  END IF;
END $$;

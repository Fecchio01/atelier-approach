PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CONTACT',
    "channel" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Activity" ("id", "leadId", "actorId", "channel", "note", "createdAt")
SELECT "id", "leadId", "actorId", "channel", "note", "createdAt" FROM "Activity";

DROP TABLE "Activity";
ALTER TABLE "new_Activity" RENAME TO "Activity";
CREATE INDEX "Activity_leadId_idx" ON "Activity"("leadId");
CREATE INDEX "Activity_actorId_idx" ON "Activity"("actorId");

ALTER TABLE "FollowUp" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "FollowUp" ADD COLUMN "completedById" TEXT;
ALTER TABLE "FollowUp" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "FollowUp" ADD COLUMN "cancelledById" TEXT;

CREATE TABLE "StageHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "StageHistory_leadId_createdAt_idx" ON "StageHistory"("leadId", "createdAt");

CREATE TABLE "SaleEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "saleValue" DECIMAL NOT NULL,
    "mrr" DECIMAL NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SaleEvent_leadId_occurredAt_idx" ON "SaleEvent"("leadId", "occurredAt");
CREATE INDEX "SaleEvent_occurredAt_idx" ON "SaleEvent"("occurredAt");

PRAGMA foreign_keys=ON;

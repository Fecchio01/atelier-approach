CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "approachesTarget" INTEGER NOT NULL,
    "revenueTarget" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Goal_ownerId_weekStart_key" ON "Goal"("ownerId", "weekStart");
CREATE INDEX "Goal_weekStart_idx" ON "Goal"("weekStart");

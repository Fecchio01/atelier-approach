CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "dayStart" TIMESTAMP(3) NOT NULL,
    "dayEnd" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "closedById" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyReport_dayStart_key" ON "DailyReport"("dayStart");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "DailyReport" TO atelier_app;

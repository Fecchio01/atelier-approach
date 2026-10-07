CREATE TABLE "ResearchSearchSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchSearchSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResearchSearchSession_ownerId_expiresAt_idx"
ON "ResearchSearchSession"("ownerId", "expiresAt");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ResearchSearchSession" TO atelier_app;

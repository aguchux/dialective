-- CreateTable
CREATE TABLE "analytics_daily_snapshots" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "screenPageViews" INTEGER NOT NULL DEFAULT 0,
    "averageSessionSeconds" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "engagementRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_daily_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_daily_breakdowns" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dimension" TEXT NOT NULL,
    "dimensionValue" TEXT NOT NULL,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "screenPageViews" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_daily_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_snapshots_date_key" ON "analytics_daily_snapshots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_breakdowns_date_dimension_dimensionValue_key" ON "analytics_daily_breakdowns"("date", "dimension", "dimensionValue");

-- CreateIndex
CREATE INDEX "analytics_daily_breakdowns_dimension_date_idx" ON "analytics_daily_breakdowns"("dimension", "date");

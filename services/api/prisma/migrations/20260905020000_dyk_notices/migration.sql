CREATE TABLE "DykSettings" (
 "id" TEXT NOT NULL DEFAULT 'default', "enabled" BOOLEAN NOT NULL DEFAULT false,
 "intervalMinutes" INTEGER NOT NULL DEFAULT 60, "maxDisplays" INTEGER NOT NULL DEFAULT 3,
 CONSTRAINT "DykSettings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DykNotice" (
 "id" TEXT NOT NULL, "content" TEXT NOT NULL, "imageKey" TEXT NOT NULL,
 "imageBucket" TEXT NOT NULL, "href" TEXT NOT NULL,
 "stopCondition" TEXT NOT NULL DEFAULT 'CLICKED', "targetId" TEXT,
 "active" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DykNotice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DykUserState" (
 "userId" TEXT NOT NULL, "noticeId" TEXT NOT NULL, "displays" INTEGER NOT NULL DEFAULT 0,
 "lastShownAt" TIMESTAMP(3), "clickedAt" TIMESTAMP(3),
 CONSTRAINT "DykUserState_pkey" PRIMARY KEY ("userId", "noticeId"),
 CONSTRAINT "DykUserState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DykUserState_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "DykNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DykUserState_userId_lastShownAt_idx" ON "DykUserState"("userId", "lastShownAt");

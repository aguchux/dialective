-- CreateEnum
CREATE TYPE "CommunityRole" AS ENUM ('MEMBER', 'MODERATOR', 'STAFF');

-- CreateEnum
CREATE TYPE "CommunityUserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "CommunityPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "CommunityReplyStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "CommunityReactionType" AS ENUM ('LIKE');

-- CreateEnum
CREATE TYPE "CommunityAttachmentType" AS ENUM ('IMAGE', 'AUDIO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "CommunityNotificationType" AS ENUM ('REPLY_TO_POST', 'REPLY_TO_REPLY', 'MENTION', 'ANNOUNCEMENT', 'MODERATION_ACTION');

-- CreateEnum
CREATE TYPE "CommunityReportTargetType" AS ENUM ('POST', 'REPLY', 'PROFILE');

-- CreateEnum
CREATE TYPE "CommunityReportReason" AS ENUM ('SPAM', 'ABUSE_HARASSMENT', 'MISINFORMATION', 'OFF_TOPIC', 'INAPPROPRIATE_CONTENT', 'IMPERSONATION', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunityReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CommunityModeratorActionType" AS ENUM ('HIDE_POST', 'RESTORE_POST', 'DELETE_POST', 'LOCK_THREAD', 'UNLOCK_THREAD', 'DELETE_REPLY', 'WARN_USER', 'SUSPEND_USER', 'BAN_USER', 'RESTORE_USER', 'RESOLVE_REPORT', 'DISMISS_REPORT', 'PIN_POST', 'UNPIN_POST');

-- CreateTable
CREATE TABLE "community_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "countryId" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dialects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "role" "CommunityRole" NOT NULL DEFAULT 'MEMBER',
    "status" "CommunityUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "bookmarkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_spaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "rules" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_space_memberships" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_space_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_posts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommunityPostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_replies" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentReplyId" TEXT,
    "body" TEXT NOT NULL,
    "status" "CommunityReplyStatus" NOT NULL DEFAULT 'PUBLISHED',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "community_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_post_tags" (
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "community_post_tags_pkey" PRIMARY KEY ("postId","tagId")
);

-- CreateTable
CREATE TABLE "community_reactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "replyId" TEXT,
    "type" "CommunityReactionType" NOT NULL DEFAULT 'LIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_attachments" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "replyId" TEXT,
    "type" "CommunityAttachmentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CommunityNotificationType" NOT NULL,
    "actorId" TEXT,
    "postId" TEXT,
    "replyId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "CommunityReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "postId" TEXT,
    "replyId" TEXT,
    "reason" "CommunityReportReason" NOT NULL,
    "notes" TEXT,
    "status" "CommunityReportStatus" NOT NULL DEFAULT 'OPEN',
    "assignedModeratorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_moderator_actions" (
    "id" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "targetType" "CommunityReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" "CommunityModeratorActionType" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_moderator_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_profiles_userId_key" ON "community_profiles"("userId");

-- CreateIndex
CREATE INDEX "community_profiles_countryId_idx" ON "community_profiles"("countryId");

-- CreateIndex
CREATE UNIQUE INDEX "community_spaces_slug_key" ON "community_spaces"("slug");

-- CreateIndex
CREATE INDEX "community_spaces_isArchived_sortOrder_idx" ON "community_spaces"("isArchived", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "community_space_memberships_spaceId_profileId_key" ON "community_space_memberships"("spaceId", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "community_posts_slug_key" ON "community_posts"("slug");

-- CreateIndex
CREATE INDEX "community_posts_spaceId_status_createdAt_idx" ON "community_posts"("spaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "community_posts_authorId_idx" ON "community_posts"("authorId");

-- CreateIndex
CREATE INDEX "community_posts_isPinned_spaceId_idx" ON "community_posts"("isPinned", "spaceId");

-- CreateIndex
CREATE INDEX "community_replies_postId_createdAt_idx" ON "community_replies"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "community_replies_authorId_idx" ON "community_replies"("authorId");

-- CreateIndex
CREATE INDEX "community_replies_parentReplyId_idx" ON "community_replies"("parentReplyId");

-- CreateIndex
CREATE UNIQUE INDEX "community_tags_name_key" ON "community_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "community_tags_slug_key" ON "community_tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "community_reactions_userId_postId_key" ON "community_reactions"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "community_reactions_userId_replyId_key" ON "community_reactions"("userId", "replyId");

-- CreateIndex
CREATE UNIQUE INDEX "community_bookmarks_userId_postId_key" ON "community_bookmarks"("userId", "postId");

-- CreateIndex
CREATE INDEX "community_attachments_postId_idx" ON "community_attachments"("postId");

-- CreateIndex
CREATE INDEX "community_attachments_replyId_idx" ON "community_attachments"("replyId");

-- CreateIndex
CREATE INDEX "community_notifications_userId_readAt_createdAt_idx" ON "community_notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "community_reports_status_createdAt_idx" ON "community_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "community_reports_targetType_targetId_idx" ON "community_reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "community_moderator_actions_targetType_targetId_idx" ON "community_moderator_actions"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "community_moderator_actions_moderatorId_createdAt_idx" ON "community_moderator_actions"("moderatorId", "createdAt");

-- AddForeignKey
ALTER TABLE "community_profiles" ADD CONSTRAINT "community_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_profiles" ADD CONSTRAINT "community_profiles_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_space_memberships" ADD CONSTRAINT "community_space_memberships_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "community_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_space_memberships" ADD CONSTRAINT "community_space_memberships_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "community_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "community_spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_parentReplyId_fkey" FOREIGN KEY ("parentReplyId") REFERENCES "community_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_tags" ADD CONSTRAINT "community_post_tags_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_tags" ADD CONSTRAINT "community_post_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "community_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "community_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_bookmarks" ADD CONSTRAINT "community_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_bookmarks" ADD CONSTRAINT "community_bookmarks_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_attachments" ADD CONSTRAINT "community_attachments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_attachments" ADD CONSTRAINT "community_attachments_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "community_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_notifications" ADD CONSTRAINT "community_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_notifications" ADD CONSTRAINT "community_notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "community_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_assignedModeratorId_fkey" FOREIGN KEY ("assignedModeratorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_moderator_actions" ADD CONSTRAINT "community_moderator_actions_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


import { Module } from '@nestjs/common';
import { CommunityProfilesModule } from './profiles/community-profiles.module';
import { CommunitySpacesModule } from './spaces/community-spaces.module';
import { CommunityTagsModule } from './tags/community-tags.module';
import { CommunityPostsModule } from './posts/community-posts.module';
import { CommunityRepliesModule } from './replies/community-replies.module';
import { CommunityReactionsModule } from './reactions/community-reactions.module';
import { CommunityBookmarksModule } from './bookmarks/community-bookmarks.module';
import { CommunityNotificationsModule } from './notifications/community-notifications.module';
import { CommunityReportsModule } from './reports/community-reports.module';
import { CommunityModerationModule } from './moderation/community-moderation.module';
import { CommunitySearchModule } from './search/community-search.module';
import { CommunityAttachmentsModule } from './attachments/community-attachments.module';
import { CommunityStatsModule } from './stats/community-stats.module';

/**
 * Dialect Library Community (community.dialectlibrary.com) -- see
 * docs/COMMUNITY-PLAN.md. Authenticated via the SAME User/JwtAuthGuard
 * identity as the rest of the main app -- not a separate identity system
 * like SubscriberUser/Voice Stream. Replaces an earlier self-hosted
 * Discourse instance (retired).
 */
@Module({
  imports: [
    CommunityProfilesModule,
    CommunitySpacesModule,
    CommunityTagsModule,
    CommunityPostsModule,
    CommunityRepliesModule,
    CommunityReactionsModule,
    CommunityBookmarksModule,
    CommunityNotificationsModule,
    CommunityReportsModule,
    CommunityModerationModule,
    CommunitySearchModule,
    CommunityAttachmentsModule,
    CommunityStatsModule,
  ],
})
export class CommunityModule {}

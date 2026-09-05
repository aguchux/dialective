import { IsIn, IsOptional, IsString } from 'class-validator';

export const COMMUNITY_FEED_TABS = ['latest', 'unanswered', 'for-you'] as const;
export type CommunityFeedTab = (typeof COMMUNITY_FEED_TABS)[number];

export class ListCommunityPostsDto {
  @IsOptional()
  @IsIn(COMMUNITY_FEED_TABS)
  tab?: CommunityFeedTab;

  @IsOptional()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}

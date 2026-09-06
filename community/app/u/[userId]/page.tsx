'use client';

import { use } from 'react';
import { User } from 'lucide-react';
import { useGetUserProfileQuery } from '@/store/api';
import { ProfileHero } from '@/components/community-content';
import { EmptyState, ErrorState, LoadingState, PageFrame, PageHeading } from '@/components/ui';

export default function PublicProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const { data: profile, isLoading, isError, refetch } = useGetUserProfileQuery(userId);

  if (isLoading)
    return (
      <PageFrame>
        <LoadingState label="Loading public profile" />
      </PageFrame>
    );
  if (isError || !profile)
    return (
      <PageFrame>
        <ErrorState
          onRetry={() => void refetch()}
          retryLabel="Retry loading profile"
          title="Profile unavailable."
          description="We could not load this community profile right now."
        />
      </PageFrame>
    );

  return (
    <PageFrame className="max-w-[1040px]">
      <PageHeading
        icon={<User aria-hidden="true" className="size-6" />}
        subtitle="Community activity and language journey."
        title={profile.displayName}
      />
      <ProfileHero profile={profile} />
      <div className="mt-5">
        <EmptyState
          title="Profile activity"
          description="Public activity will appear here as this profile contributes to the community."
        />
      </div>
    </PageFrame>
  );
}

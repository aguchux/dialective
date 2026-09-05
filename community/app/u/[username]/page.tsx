'use client';

import { use } from 'react';
import { useGetUserProfileQuery } from '@/store/api';
import { Badge, Card, PageHeading } from '@/components/ui';

export default function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { data: profile } = useGetUserProfileQuery(username);

  if (!profile) {
    return <p className="px-4 py-12 text-center text-sm text-muted">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeading title={profile.displayName} />
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-accent text-2xl font-black text-white">
            {profile.displayName.trim()[0]?.toUpperCase()}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-black text-ink">{profile.displayName}</p>
              {profile.badge && <Badge>{profile.badge === 'VERIFIED_TRAINER' ? 'Verified Trainer' : 'Distributor'}</Badge>}
            </div>
            <p className="text-xs font-semibold text-muted">
              {profile.postCount} posts &middot; {profile.replyCount} replies
            </p>
          </div>
        </div>
        {profile.bio && <p className="mt-4 text-sm text-ink">{profile.bio}</p>}
      </Card>
    </div>
  );
}

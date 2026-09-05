'use client';

import { use } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MessageSquare, Heart } from 'lucide-react';
import { useGetSpaceQuery, useJoinSpaceMutation, useLeaveSpaceMutation, useListPostsQuery } from '@/store/api';
import { Card, PageHeading, PrimaryButton, SecondaryButton } from '@/components/ui';

export default function SpacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { status } = useSession();
  const { data: space } = useGetSpaceQuery(slug);
  const { data: posts } = useListPostsQuery({ spaceSlug: slug }, { skip: !space });
  const [joinSpace, { isLoading: joining }] = useJoinSpaceMutation();
  const [leaveSpace, { isLoading: leaving }] = useLeaveSpaceMutation();

  if (!space) {
    return <p className="px-4 py-12 text-center text-sm text-muted">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading title={space.name} subtitle={space.description ?? undefined} />
        {status === 'authenticated' &&
          (space.joined ? (
            <SecondaryButton disabled={leaving} onClick={() => void leaveSpace(space.id)} type="button">
              Joined
            </SecondaryButton>
          ) : (
            <PrimaryButton disabled={joining} onClick={() => void joinSpace(space.id)} type="button">
              Join
            </PrimaryButton>
          ))}
      </div>

      {(posts?.items.length ?? 0) === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">No posts in this space yet.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {posts!.items.map((post) => (
            <Link href={`/post/${post.slug}`} key={post.id}>
              <Card className="p-4 transition-colors hover:border-accent">
                <h2 className="text-base font-black text-ink">{post.title}</h2>
                <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-muted">
                  <span className="flex items-center gap-1">
                    <MessageSquare aria-hidden="true" className="size-3.5" /> {post.replyCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart aria-hidden="true" className="size-3.5" /> {post.likeCount}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useAddBookmarkMutation,
  useLikePostMutation,
  useListPostsQuery,
  useListSpacesQuery,
  useListTagsQuery,
  useRemoveBookmarkMutation,
  useSearchQuery,
  useUnlikePostMutation,
  useReactToPostMutation,
  useRemovePostReactionMutation,
} from '@/store/api';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  PageHeading,
  TextInput,
} from '@/components/ui';
import {
  FeaturedBanner,
  PopularTags,
  SpaceGrid,
  TopicChips,
  TrendingList,
} from '@/components/community-discovery';
import { SectionHeading } from '@/components/community-navigation';
import { PostCard } from '@/components/community-content';
import { usePostOverflow } from '@/lib/use-post-overflow';

export default function ExplorePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('All');
  const { overflowItemsFor, dialogs } = usePostOverflow();
  const [likePost] = useLikePostMutation();
  const [unlikePost] = useUnlikePostMutation();
  const [addBookmark] = useAddBookmarkMutation();
  const [removeBookmark] = useRemoveBookmarkMutation();
  const [reactToPost] = useReactToPostMutation();
  const [removePostReaction] = useRemovePostReactionMutation();
  const {
    data: spaces,
    isLoading: spacesLoading,
    isError: spacesError,
    refetch: refetchSpaces,
  } = useListSpacesQuery();
  const { data: tags, isLoading: tagsLoading } = useListTagsQuery();
  const topicItems = useMemo(
    () => [
      'All',
      ...(tags ?? [])
        .filter((tag) => !tag.isHidden)
        .slice(0, 7)
        .map((tag) => tag.name),
    ],
    [tags],
  );
  const selectedTag = tags?.find((tag) => tag.name === topic || tag.slug === topic);
  const { data: trending, isLoading: trendingLoading } = useListPostsQuery({
    tab: 'latest',
    tagId: selectedTag?.id,
  });
  const {
    data: results,
    isFetching,
    isError,
    refetch,
  } = useSearchQuery(query.trim(), { skip: query.trim().length < 2 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? '');
    const tagParam = params.get('tag');
    const matchingTag = tags?.find((tag) => tag.slug === tagParam || tag.name === tagParam);
    setTopic(matchingTag?.name ?? 'All');
  }, [tags]);

  function handleTopicSelect(value: string) {
    setTopic(value);
    const params = new URLSearchParams(window.location.search);
    const selected = tags?.find((tag) => tag.name === value);
    if (value === 'All' || !selected) params.delete('tag');
    else params.set('tag', selected.slug);
    router.replace(`/explore${params.toString() ? `?${params.toString()}` : ''}`, {
      scroll: false,
    });
  }

  const isSearching = query.trim().length >= 2;

  return (
    <PageFrame>
      <PageHeading subtitle="Find a useful discussion, space, or language topic." title="Explore" />

      <form className="relative mb-4 max-w-3xl" onSubmit={(event) => event.preventDefault()}>
        <label className="sr-only" htmlFor="community-search">
          Search community
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
        />
        <TextInput
          aria-describedby="search-hint"
          className="pl-12"
          id="community-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search discussions, spaces, people..."
          value={query}
        />
      </form>
      <p className="mb-3 text-xs font-semibold text-muted" id="search-hint">
        Search results update as you type.
      </p>
      {tagsLoading ? (
        <div className="mb-2 h-11 w-full animate-pulse rounded-full bg-surface-muted" />
      ) : topicItems.length > 1 ? (
        <TopicChips active={topic} items={topicItems} onSelect={handleTopicSelect} />
      ) : null}

      {isSearching ? (
        <div className="mt-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-ink">Results for “{query}”</h2>
          </div>
          {isFetching ? (
            <LoadingState label="Searching community" />
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} retryLabel="Retry search" />
          ) : (
            <div className="grid gap-7">
              {(results?.posts.length ?? 0) > 0 && (
                <section>
                  <SectionHeading title="Discussions" />
                  <div className="grid gap-3">
                    {results!.posts.map((post) => (
                      <PostCard
                        key={post.id}
                        onBookmark={() =>
                          void (post.bookmarkedByMe
                            ? removeBookmark(post.id)
                            : addBookmark(post.id))
                        }
                        onLike={() =>
                          void (post.likedByMe ? unlikePost(post.id) : likePost(post.id))
                        }
                        onReaction={(type) =>
                          void (post.reactionTypeByMe === type
                            ? removePostReaction(post.id)
                            : reactToPost({ postId: post.id, type }))
                        }
                        overflowItems={overflowItemsFor(post, () =>
                          router.push(`/post/${post.slug}`),
                        )}
                        post={post}
                      />
                    ))}
                  </div>
                </section>
              )}
              {(results?.spaces.length ?? 0) > 0 && (
                <section>
                  <SectionHeading title="Spaces" />
                  <SpaceGrid spaces={results!.spaces} />
                </section>
              )}
              {(results?.posts.length ?? 0) === 0 && (results?.spaces.length ?? 0) === 0 && (
                <EmptyState
                  description={`Try a different search than “${query}”.`}
                  title="No results found"
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-7 grid gap-9">
          <FeaturedBanner />
          <section id="spaces" className="scroll-mt-24">
            <SectionHeading
              action={
                <Link className="text-sm font-extrabold text-accent hover:underline" href="#spaces">
                  See all spaces
                </Link>
              }
              title="Community spaces"
            />
            {spacesLoading ? (
              <LoadingState label="Loading spaces" />
            ) : spacesError ? (
              <ErrorState onRetry={() => void refetchSpaces()} retryLabel="Retry loading spaces" />
            ) : spaces?.length ? (
              <SpaceGrid spaces={spaces} />
            ) : (
              <EmptyState
                description="Spaces will appear here when they are available."
                title="No spaces yet"
              />
            )}
          </section>
          <div className="grid gap-7 lg:grid-cols-2">
            <section>
              <SectionHeading title="Trending discussions" />
              {trendingLoading ? (
                <LoadingState label="Loading trending discussions" />
              ) : (
                <TrendingList posts={trending?.items ?? []} />
              )}
            </section>
            <section>
              <SectionHeading title="Popular tags" />
              <PopularTags tags={tags ?? []} />
            </section>
          </div>
        </div>
      )}
      {dialogs}
    </PageFrame>
  );
}

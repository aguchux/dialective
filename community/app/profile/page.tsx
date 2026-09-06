'use client';

import { FormEvent, useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { useGetMyProfileQuery, useListMyPostsQuery, useUpdateMyProfileMutation } from '@/store/api';
import { ProfileHero, PostCard } from '@/components/community-content';
import {
  EmptyState,
  ErrorState,
  ErrorText,
  FieldLabel,
  LoadingState,
  PageFrame,
  PageHeading,
  PrimaryButton,
  TextArea,
  TextInput,
} from '@/components/ui';

export default function ProfilePage() {
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useGetMyProfileQuery();
  const {
    data: posts,
    isLoading: postsLoading,
    isError: postsError,
    refetch: refetchPosts,
  } = useListMyPostsQuery();
  const [updateProfile, { isLoading }] = useUpdateMyProfileMutation();
  const [editOpen, setEditOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setBio(profile.bio ?? '');
  }, [profile]);

  if (profileLoading)
    return (
      <PageFrame>
        <LoadingState label="Loading profile" />
      </PageFrame>
    );
  if (profileError || !profile)
    return (
      <PageFrame>
        <ErrorState
          onRetry={() => void refetchProfile()}
          retryLabel="Retry loading profile"
          title="Could not load your profile."
          description="Please try again to view your community profile."
        />
      </PageFrame>
    );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setError(null);
    if (displayName.trim().length < 2) {
      setError('Add a display name with at least 2 characters.');
      return;
    }
    try {
      await updateProfile({ displayName: displayName.trim(), bio: bio.trim() }).unwrap();
      setSaved(true);
      setEditOpen(false);
    } catch {
      setError('Could not update your profile. Please try again.');
    }
  }

  return (
    <PageFrame className="max-w-[1040px]">
      <PageHeading
        icon={<User aria-hidden="true" className="size-6" />}
        subtitle="Your contributions and language journey."
        title="Profile"
      />
      <ProfileHero editable onEdit={() => setEditOpen((current) => !current)} profile={profile} />
      {saved && (
        <p className="mt-3 text-sm font-bold text-success" role="status">
          Profile updated.
        </p>
      )}
      {editOpen && (
        <form
          className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-community-card sm:p-6"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-4 sm:max-w-2xl">
            <div>
              <FieldLabel htmlFor="profile-display-name" required>
                Display name
              </FieldLabel>
              <TextInput
                id="profile-display-name"
                maxLength={80}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </div>
            <div>
              <FieldLabel htmlFor="profile-bio">Bio</FieldLabel>
              <TextArea
                aria-describedby="profile-bio-count"
                id="profile-bio"
                maxLength={500}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Tell the community about yourself"
                rows={4}
                value={bio}
              />
              <p
                className="mt-1 text-right text-xs font-semibold text-muted"
                id="profile-bio-count"
              >
                {bio.length}/500
              </p>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <PrimaryButton pending={isLoading} pendingLabel="Saving" type="submit">
                Save changes
              </PrimaryButton>
              <button
                className="min-h-11 rounded-lg border border-line px-4 text-sm font-extrabold text-ink hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
                onClick={() => setEditOpen(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}
      <div className="mt-7 flex items-center justify-between gap-3 border-b border-line pb-3">
        <h2 className="text-xl font-black tracking-tight text-ink">Your posts</h2>
        <span className="text-xs font-bold text-muted">{posts?.items.length ?? 0} shown</span>
      </div>
      <div className="mt-4">
        {postsLoading ? (
          <LoadingState label="Loading your posts" />
        ) : postsError ? (
          <ErrorState onRetry={() => void refetchPosts()} retryLabel="Retry loading posts" />
        ) : posts?.items.length ? (
          <div className="grid gap-3">
            {posts.items.map((post) => (
              <PostCard key={post.id} post={post} showSpace />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No posts yet"
            description="Your community contributions will appear here."
          />
        )}
      </div>
    </PageFrame>
  );
}

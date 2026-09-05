'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useGetMyProfileQuery, useUpdateMyProfileMutation } from '@/store/api';
import { Badge, Card, FieldLabel, PageHeading, PrimaryButton, TextArea, TextInput } from '@/components/ui';

export default function ProfilePage() {
  const { data: profile } = useGetMyProfileQuery();
  const [updateProfile, { isLoading }] = useUpdateMyProfileMutation();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setBio(profile.bio ?? '');
    }
  }, [profile]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    await updateProfile({ displayName, bio }).unwrap();
    setSaved(true);
  }

  if (!profile) {
    return <p className="px-4 py-12 text-center text-sm text-muted">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeading title="Profile" />

      <Card className="mb-4 p-6">
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
      </Card>

      <Card className="p-6">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div>
            <FieldLabel>Display name</FieldLabel>
            <TextInput
              maxLength={80}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              value={displayName}
            />
          </div>
          <div>
            <FieldLabel>Bio</FieldLabel>
            <TextArea
              maxLength={500}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell the community about yourself"
              rows={4}
              value={bio}
            />
          </div>
          {saved && <p className="text-sm font-semibold text-accent">Profile updated.</p>}
          <PrimaryButton className="justify-self-start" disabled={isLoading} type="submit">
            {isLoading ? 'Saving...' : 'Save changes'}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}

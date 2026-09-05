'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreatePostMutation, useListSpacesQuery } from '@/store/api';
import { Card, ErrorText, FieldLabel, PageHeading, PrimaryButton, TextArea, TextInput } from '@/components/ui';

export default function NewPostPage() {
  const router = useRouter();
  const { data: spaces } = useListSpacesQuery();
  const [createPost, { isLoading }] = useCreatePostMutation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!spaceId) {
      setError('Choose a space for this post.');
      return;
    }
    try {
      const post = await createPost({ title, body, spaceId }).unwrap();
      router.push(`/post/${post.slug}`);
    } catch {
      setError('Could not create your post. Please try again.');
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeading title="Create Post" subtitle="Ask a question, share an idea, or start a discussion." />
      <Card className="p-6">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div>
            <FieldLabel>Space</FieldLabel>
            <select
              className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
              onChange={(e) => setSpaceId(e.target.value)}
              required
              value={spaceId}
            >
              <option value="">Choose a space...</option>
              {(spaces ?? []).map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Title</FieldLabel>
            <TextInput
              maxLength={160}
              minLength={3}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's your question or topic?"
              required
              value={title}
            />
          </div>
          <div>
            <FieldLabel>Details</FieldLabel>
            <TextArea
              maxLength={5000}
              minLength={1}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share the details. Markdown is supported."
              required
              rows={10}
              value={body}
            />
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          <PrimaryButton disabled={isLoading} type="submit">
            {isLoading ? 'Posting...' : 'Post'}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}

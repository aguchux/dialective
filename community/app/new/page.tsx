'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { normalizeErrorMessage, useCreatePostMutation, useListSpacesQuery } from '@/store/api';
import { AttachmentPicker, TagInput, type PendingAttachment } from '@/components/community-form';
import { BackLink } from '@/components/community-navigation';
import {
  ErrorText,
  FieldLabel,
  PageFrame,
  PrimaryButton,
  SecondaryButton,
  Select,
  TextArea,
  TextInput,
} from '@/components/ui';

export default function NewPostPage() {
  const router = useRouter();
  const { data: spaces } = useListSpacesQuery();
  const [createPost, { isLoading }] = useCreatePostMutation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const selectedSpace = useMemo(
    () => spaces?.find((space) => space.id === spaceId),
    [spaceId, spaces],
  );

  function validate(): boolean {
    if (!spaceId) {
      setError('Choose a space for this post.');
      return false;
    }
    if (title.trim().length < 3) {
      setError('Add a title with at least 3 characters.');
      return false;
    }
    if (!body.trim()) {
      setError('Add some details before publishing.');
      return false;
    }
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    try {
      const post = await createPost({
        title: title.trim(),
        body: body.trim(),
        spaceId,
        tags,
        attachments: attachments.map(({ localId: _localId, ...rest }) => rest),
      }).unwrap();
      router.push(`/post/${post.slug}`);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not create your post. Please try again.'));
    }
  }

  async function saveDraft() {
    setError(null);
    if (!validate()) return;
    setSavingDraft(true);
    try {
      await createPost({
        title: title.trim(),
        body: body.trim(),
        spaceId,
        tags,
        status: 'DRAFT',
        attachments: attachments.map(({ localId: _localId, ...rest }) => rest),
      }).unwrap();
      router.push('/me/posts');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not save your draft. Please try again.'));
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <PageFrame className="max-w-[980px]">
      <BackLink />
      <div className="mb-6">
        <h1 className="text-[28px] font-black tracking-tight text-ink sm:text-3xl">
          Create a post
        </h1>
        <p className="mt-1 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Ask a question, share an idea, or start a discussion with enough context for others to
          help.
        </p>
      </div>
      <form
        className="rounded-lg border border-line bg-surface p-5 shadow-community-card sm:p-7"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-5">
          <div>
            <FieldLabel htmlFor="post-title" required>
              Title
            </FieldLabel>
            <TextInput
              id="post-title"
              maxLength={160}
              minLength={3}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What's your post about?"
              required
              value={title}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="post-space" required>
                Space
              </FieldLabel>
              <Select
                id="post-space"
                onChange={(event) => setSpaceId(event.target.value)}
                required
                value={spaceId}
              >
                <option value="">Select a space</option>
                {(spaces ?? []).map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </Select>
              {selectedSpace && (
                <p className="mt-1.5 text-xs text-muted">Posting in {selectedSpace.name}</p>
              )}
            </div>
            <div>
              <FieldLabel>Tags</FieldLabel>
              <TagInput onChange={setTags} tags={tags} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor="post-details" required>
                Post details
              </FieldLabel>
              <span className="text-xs font-bold text-muted">{body.length}/5000</span>
            </div>
            <TextArea
              id="post-details"
              maxLength={5000}
              minLength={1}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Share your thoughts, question, or idea..."
              required
              rows={9}
              value={body}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-extrabold text-ink">
              Add attachments <span className="font-medium text-muted">(optional)</span>
            </p>
            <AttachmentPicker attachments={attachments} onChange={setAttachments} />
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 py-2.5 text-sm font-extrabold text-ink hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              href="/"
            >
              Cancel
            </Link>
            <SecondaryButton
              onClick={() => void saveDraft()}
              pending={savingDraft}
              pendingLabel="Saving"
              type="button"
            >
              Save as draft
            </SecondaryButton>
            <PrimaryButton pending={isLoading} pendingLabel="Publishing" type="submit">
              Publish post
            </PrimaryButton>
          </div>
        </div>
      </form>
    </PageFrame>
  );
}

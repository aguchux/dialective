'use client';

import { type FormEvent, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminCommunityTag,
  normalizeErrorMessage,
  useCreateAdminCommunityTagMutation,
  useDeleteAdminCommunityTagMutation,
  useGetAdminCommunityTagsQuery,
  useHideAdminCommunityTagMutation,
  useMergeAdminCommunityTagsMutation,
  useRenameAdminCommunityTagMutation,
} from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-[#fde8e8] disabled:cursor-not-allowed disabled:opacity-60';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export default function AdminCommunityTagsPage() {
  const { data: tags, isLoading, isError, refetch } = useGetAdminCommunityTagsQuery();
  const [createTag, { isLoading: isCreating }] = useCreateAdminCommunityTagMutation();
  const [renameTag] = useRenameAdminCommunityTagMutation();
  const [hideTag] = useHideAdminCommunityTagMutation();
  const [deleteTag] = useDeleteAdminCommunityTagMutation();
  const [mergeTags] = useMergeAdminCommunityTagsMutation();
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeTargetSlug, setMergeTargetSlug] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createTag({ name: newName.trim() }).unwrap();
      setNewName('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to create tag.'));
    }
  }

  async function handleRename(tag: AdminCommunityTag) {
    setError(null);
    setBusyId(tag.id);
    try {
      await renameTag({ id: tag.id, name: renameValue.trim() }).unwrap();
      setRenamingId(null);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to rename tag.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleHide(tag: AdminCommunityTag) {
    setError(null);
    setBusyId(tag.id);
    try {
      await hideTag({ id: tag.id, isHidden: !tag.isHidden }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update tag visibility.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(tag: AdminCommunityTag) {
    setError(null);
    setBusyId(tag.id);
    try {
      await deleteTag(tag.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete tag -- it may still be in use.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleMerge(tag: AdminCommunityTag) {
    const target = tags?.find((t) => t.slug === mergeTargetSlug.trim());
    if (!target) {
      setError('Enter the exact slug of the tag to merge into.');
      return;
    }
    setError(null);
    setBusyId(tag.id);
    try {
      await mergeTags({ id: tag.id, targetId: target.id }).unwrap();
      setMergingId(null);
      setMergeTargetSlug('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to merge tags.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Community Topics</h1>
          <p className="leading-relaxed text-muted">
            Tags members attach to discussions. Merging moves every post from one tag onto another
            and removes the source tag.
          </p>
        </div>

        <form className="flex flex-wrap items-end gap-3" onSubmit={handleCreate}>
          <label className="grid gap-1.5 text-sm font-bold" htmlFor="new-tag-name">
            New topic
            <input
              className={`${inputClass} w-64`}
              id="new-tag-name"
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Pronunciation"
              required
              value={newName}
            />
          </label>
          <ActionButton className={primaryButtonClass} pending={isCreating} pendingLabel="Adding" type="submit">
            Add topic
          </ActionButton>
        </form>

        {error && (
          <p className="leading-relaxed text-danger" role="alert">
            {error}
          </p>
        )}

        <section className="grid gap-4 overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          {isLoading ? (
            <p className="p-5 text-muted">Loading...</p>
          ) : isError ? (
            <div className="grid gap-3 p-5 text-center">
              <p className="font-extrabold">Could not load topics.</p>
              <button className={secondaryButtonClass} onClick={() => void refetch()} type="button">
                Try again
              </button>
            </div>
          ) : tags && tags.length > 0 ? (
            <div className="divide-y divide-line">
              {tags.map((tag) => (
                <div className="grid gap-3 p-4" key={tag.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {renamingId === tag.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          className={`${inputClass} max-w-xs`}
                          maxLength={40}
                          onChange={(e) => setRenameValue(e.target.value)}
                          value={renameValue}
                        />
                        <ActionButton
                          className={secondaryButtonClass}
                          onClick={() => handleRename(tag)}
                          pending={busyId === tag.id}
                          pendingLabel="Saving"
                          type="button"
                        >
                          Save
                        </ActionButton>
                        <button
                          className={secondaryButtonClass}
                          onClick={() => setRenamingId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="font-extrabold">
                          #{tag.name}{' '}
                          {tag.isHidden && (
                            <span className="ml-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-bold text-muted">
                              Hidden
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">{tag.slug}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {renamingId !== tag.id && (
                        <button
                          className={secondaryButtonClass}
                          onClick={() => {
                            setRenamingId(tag.id);
                            setRenameValue(tag.name);
                          }}
                          type="button"
                        >
                          Rename
                        </button>
                      )}
                      <button
                        className={secondaryButtonClass}
                        onClick={() => setMergingId(mergingId === tag.id ? null : tag.id)}
                        type="button"
                      >
                        Merge into...
                      </button>
                      <ActionButton
                        className={secondaryButtonClass}
                        onClick={() => handleHide(tag)}
                        pending={busyId === tag.id}
                        pendingLabel="Saving"
                        type="button"
                      >
                        {tag.isHidden ? 'Unhide' : 'Hide'}
                      </ActionButton>
                      <ActionButton
                        className={dangerButtonClass}
                        onClick={() => handleDelete(tag)}
                        pending={busyId === tag.id}
                        pendingLabel="Deleting"
                        type="button"
                      >
                        Delete
                      </ActionButton>
                    </div>
                  </div>
                  {mergingId === tag.id && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-muted p-3">
                      <label className="text-sm font-bold" htmlFor={`merge-target-${tag.id}`}>
                        Merge #{tag.name} into (slug):
                      </label>
                      <input
                        className={`${inputClass} max-w-xs`}
                        id={`merge-target-${tag.id}`}
                        onChange={(e) => setMergeTargetSlug(e.target.value)}
                        placeholder="target-slug"
                        value={mergeTargetSlug}
                      />
                      <ActionButton
                        className={dangerButtonClass}
                        onClick={() => handleMerge(tag)}
                        pending={busyId === tag.id}
                        pendingLabel="Merging"
                        type="button"
                      >
                        Merge
                      </ActionButton>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-muted">No topics yet.</p>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

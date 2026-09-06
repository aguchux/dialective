'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  AdminCommunitySpace,
  normalizeErrorMessage,
  useCreateAdminCommunitySpaceMutation,
  useDeleteAdminCommunitySpaceMutation,
  useGetAdminCommunitySpacesQuery,
  useUpdateAdminCommunitySpaceMutation,
} from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-[#fde8e8] disabled:cursor-not-allowed disabled:opacity-60';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export default function AdminCommunitySpacesPage() {
  const { data: spaces, isLoading, isError, refetch } = useGetAdminCommunitySpacesQuery();
  const [deleteSpace] = useDeleteAdminCommunitySpaceMutation();
  const [editing, setEditing] = useState<AdminCommunitySpace | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    try {
      await deleteSpace(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete this space.'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-2">
            <h1 className="text-3xl font-black">Community Spaces</h1>
            <p className="leading-relaxed text-muted">
              Topic containers members post into. A space with existing posts can be archived but
              not deleted.
            </p>
          </div>
          <button className={primaryButtonClass} onClick={() => setEditing('new')} type="button">
            New space
          </button>
        </div>

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
              <p className="font-extrabold">Could not load spaces.</p>
              <button className={secondaryButtonClass} onClick={() => void refetch()} type="button">
                Try again
              </button>
            </div>
          ) : spaces && spaces.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 border-collapse text-left text-sm">
                <thead className="border-b border-line bg-surface-muted text-xs font-extrabold uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3.5" scope="col">
                      Name
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Slug
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Status
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Posts
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Members
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {spaces.map((space) => (
                    <tr key={space.id}>
                      <td className="px-5 py-3.5 font-extrabold">{space.name}</td>
                      <td className="px-5 py-3.5 text-muted">{space.slug}</td>
                      <td className="px-5 py-3.5">
                        {space.isArchived ? (
                          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-bold text-muted">
                            Archived
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-muted">{space._count.posts}</td>
                      <td className="px-5 py-3.5 text-muted">{space._count.memberships}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className={secondaryButtonClass}
                            onClick={() => setEditing(space)}
                            type="button"
                          >
                            Edit
                          </button>
                          <ActionButton
                            className={dangerButtonClass}
                            onClick={() => handleDelete(space.id)}
                            pending={deletingId === space.id}
                            pendingLabel="Deleting"
                            type="button"
                          >
                            Delete
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-muted">No spaces yet. Create the first one to let members post.</p>
          )}
        </section>
      </div>

      {editing && <SpaceFormDialog onClose={() => setEditing(null)} space={editing === 'new' ? null : editing} />}
    </AdminShell>
  );
}

function SpaceFormDialog({
  space,
  onClose,
}: {
  space: AdminCommunitySpace | null;
  onClose: () => void;
}) {
  const [createSpace, { isLoading: isCreating }] = useCreateAdminCommunitySpaceMutation();
  const [updateSpace, { isLoading: isUpdating }] = useUpdateAdminCommunitySpaceMutation();
  const [name, setName] = useState(space?.name ?? '');
  const [slug, setSlug] = useState(space?.slug ?? '');
  const [description, setDescription] = useState(space?.description ?? '');
  const [rules, setRules] = useState(space?.rules ?? '');
  const [isArchived, setIsArchived] = useState(space?.isArchived ?? false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (space) return;
    setSlug(
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    );
  }, [name, space]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      rules: rules.trim() || undefined,
      isArchived,
    };
    try {
      if (space) await updateSpace({ id: space.id, body }).unwrap();
      else await createSpace(body).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save this space.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={space ? 'Edit space' : 'New space'}>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm font-bold" htmlFor="space-name">
            Name
            <input
              className={inputClass}
              id="space-name"
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              required
              value={name}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold" htmlFor="space-slug">
            Slug
            <input
              className={inputClass}
              id="space-slug"
              maxLength={80}
              onChange={(e) => setSlug(e.target.value)}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
              value={slug}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold" htmlFor="space-description">
            Description
            <textarea
              className={`${inputClass} min-h-20`}
              id="space-description"
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              value={description}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold" htmlFor="space-rules">
            Rules
            <textarea
              className={`${inputClass} min-h-24`}
              id="space-rules"
              maxLength={5000}
              onChange={(e) => setRules(e.target.value)}
              value={rules}
            />
          </label>
          <label
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
            htmlFor="space-archived"
          >
            <input
              checked={isArchived}
              className="mt-0.5 size-5 accent-accent"
              id="space-archived"
              onChange={(e) => setIsArchived(e.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block font-bold">Archived</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">
                Hidden from the community's space list. Existing posts remain untouched.
              </span>
            </span>
          </label>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
            <ActionButton
              className={primaryButtonClass}
              pending={isCreating || isUpdating}
              pendingLabel="Saving"
              type="submit"
            >
              Save
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

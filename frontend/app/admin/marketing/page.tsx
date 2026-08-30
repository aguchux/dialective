'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Trash2 } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminMarketingAdPhoto,
  AdminMarketingHeadline,
  MarketingAdFormat,
  normalizeErrorMessage,
  useCreateMarketingHeadlineMutation,
  useCreateMarketingPhotoMutation,
  useCreateMarketingPhotoUploadUrlMutation,
  useDeleteMarketingHeadlineMutation,
  useDeleteMarketingPhotoMutation,
  useGetAdminMarketingHeadlinesQuery,
  useGetAdminMarketingPhotosQuery,
  useUpdateMarketingHeadlineMutation,
  useUpdateMarketingPhotoMutation,
} from '@/store/api';

const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const primaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

const FORMAT_TABS: { key: MarketingAdFormat; label: string; dimensions: string }[] = [
  { key: 'FEED_SQUARE', label: 'Feed post', dimensions: '1080 x 1080' },
  { key: 'STORY', label: 'Story or status', dimensions: '1080 x 1920' },
  { key: 'LINK_PREVIEW', label: 'Link preview', dimensions: '1200 x 630' },
];

function PhotoUploadButton({ format }: { format: MarketingAdFormat }) {
  const [createUploadUrl] = useCreateMarketingPhotoUploadUrlMutation();
  const [createPhoto, { isLoading }] = useCreateMarketingPhotoMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      const upload = await createUploadUrl({ format, contentType: file.type }).unwrap();
      const uploaded = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploaded.ok) throw new Error('The image upload failed. Please try again.');
      await createPhoto({ format, bucket: upload.bucket, key: upload.key }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to upload this photo.'));
    }
  }

  return (
    <div className="grid gap-2">
      <label className={`${primaryButtonClass} w-fit cursor-pointer`}>
        {isLoading ? 'Uploading...' : 'Add photo'}
        <input
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={isLoading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleFile(file);
          }}
          type="file"
        />
      </label>
      {error && (
        <p className="text-xs font-bold text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PhotoCard({ photo }: { photo: AdminMarketingAdPhoto }) {
  const [updatePhoto] = useUpdateMarketingPhotoMutation();
  const [deletePhoto, { isLoading: isDeleting }] = useDeleteMarketingPhotoMutation();

  return (
    <article className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="relative aspect-square bg-surface-muted">
        <Image alt="Ad photo" className="object-cover" fill sizes="200px" src={photo.url} />
      </div>
      <div className="grid gap-2 p-3">
        <label className="flex items-center gap-2 text-xs font-bold">
          <input
            checked={photo.active}
            onChange={(e) => void updatePhoto({ id: photo.id, active: e.target.checked })}
            type="checkbox"
          />
          Active
        </label>
        <div className="flex items-center justify-between gap-2">
          <input
            className="min-h-8 w-16 rounded-lg border border-line bg-white px-2 text-xs"
            onChange={(e) =>
              void updatePhoto({ id: photo.id, sortOrder: Number(e.target.value) || 0 })
            }
            title="Sort order"
            type="number"
            value={photo.sortOrder}
          />
          <button
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-danger hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isDeleting}
            onClick={() => void deletePhoto(photo.id)}
            title="Delete photo"
            type="button"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

function HeadlineForm({ format }: { format: MarketingAdFormat }) {
  const [createHeadline, { isLoading }] = useCreateMarketingHeadlineMutation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createHeadline({
        format,
        title: title.trim(),
        description: description.trim(),
      }).unwrap();
      setTitle('');
      setDescription('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to add this headline.'));
    }
  }

  return (
    <form
      className="grid gap-2 rounded-lg border border-line bg-surface-muted p-3"
      onSubmit={handleSubmit}
    >
      <input
        className="min-h-9 w-full rounded-lg border border-line bg-white px-3 text-sm"
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Headline title"
        required
        value={title}
      />
      <textarea
        className="min-h-16 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
        maxLength={400}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        required
        value={description}
      />
      {error && (
        <p className="text-xs font-bold text-danger" role="alert">
          {error}
        </p>
      )}
      <ActionButton
        className={`${primaryButtonClass} w-fit`}
        pending={isLoading}
        pendingLabel="Adding"
        type="submit"
      >
        Add headline
      </ActionButton>
    </form>
  );
}

function HeadlineRow({ headline }: { headline: AdminMarketingHeadline }) {
  const [updateHeadline] = useUpdateMarketingHeadlineMutation();
  const [deleteHeadline, { isLoading: isDeleting }] = useDeleteMarketingHeadlineMutation();

  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-extrabold">{headline.title}</p>
        <p className="mt-1 max-w-md text-xs text-muted">{headline.description}</p>
      </td>
      <td className="px-4 py-3">
        <label className="flex items-center gap-2 text-xs font-bold">
          <input
            checked={headline.active}
            onChange={(e) => void updateHeadline({ id: headline.id, active: e.target.checked })}
            type="checkbox"
          />
          Active
        </label>
      </td>
      <td className="px-4 py-3">
        <button
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-danger hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isDeleting}
          onClick={() => void deleteHeadline(headline.id)}
          title="Delete headline"
          type="button"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function FormatSection({ format }: { format: MarketingAdFormat }) {
  const { data: photos, isLoading: photosLoading } = useGetAdminMarketingPhotosQuery(format);
  const { data: headlines, isLoading: headlinesLoading } =
    useGetAdminMarketingHeadlinesQuery(format);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">Ad photos</h2>
          <PhotoUploadButton format={format} />
        </div>
        {photosLoading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : photos && photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No photos uploaded for this format yet.</p>
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-black">Headlines</h2>
        <HeadlineForm format={format} />
        {headlinesLoading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : headlines && headlines.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-xs font-black uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Headline</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {headlines.map((headline) => (
                  <HeadlineRow headline={headline} key={headline.id} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No headlines for this format yet.</p>
        )}
      </section>
    </div>
  );
}

export default function AdminMarketingPage() {
  const [format, setFormat] = useState<MarketingAdFormat>('FEED_SQUARE');

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Marketing</h1>
          <p className="leading-relaxed text-muted">
            Manage the ad photos and headlines trainers can pair together when sharing referral
            campaigns.
          </p>
        </div>

        <div className="flex gap-1">
          {FORMAT_TABS.map((tab) => (
            <button
              className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                format === tab.key
                  ? 'bg-accent text-white'
                  : 'bg-white text-ink hover:bg-surface-muted'
              }`}
              key={tab.key}
              onClick={() => setFormat(tab.key)}
              type="button"
            >
              {tab.label} <span className="opacity-70">({tab.dimensions})</span>
            </button>
          ))}
        </div>

        <section className="rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <FormatSection format={format} />
        </section>
      </div>
    </AdminShell>
  );
}

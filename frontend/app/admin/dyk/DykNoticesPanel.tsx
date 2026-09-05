'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Pencil, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import {
  DYK_CONDITIONS,
  DykDraft,
  DykNotice,
  useAdminDykQuery,
  useDeleteDykMutation,
  useSaveDykMutation,
  useUploadDykMutation,
} from '@/store/dyk-api';

const conditionLabel: Record<string, string> = Object.fromEntries(DYK_CONDITIONS.map((c) => [c.key, c.label]));
const blank: DykDraft = {
  content: '',
  imageKey: '',
  imageBucket: '',
  href: '/dashboard',
  stopConditions: ['CLICKED'],
  active: true,
  sortOrder: 0,
};
const input = 'w-full rounded-lg border border-line bg-white p-2.5 text-ink outline-none transition-colors focus:border-accent';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 font-extrabold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-danger bg-danger px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60';

/** Notice CRUD only -- photo, content, destination, stop conditions, ordering. Platform-wide gates (on/off, interval, max displays) live on the admin settings "Do you know?" tab instead (DykSettingsPanel). */
export function DykNoticesPanel() {
  const notices = useAdminDykQuery();
  const [remove, deleting] = useDeleteDykMutation();
  const [editing, setEditing] = useState<DykNotice | 'new' | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (notices.isLoading) return <p role="status">Loading notices...</p>;
  if (notices.isError) {
    return (
      <div role="alert">
        Unable to load notices. <button className={secondaryButtonClass} onClick={() => notices.refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Notices</h2>
        <button className={primaryButtonClass} onClick={() => setEditing('new')} type="button">
          <Plus className="size-4" aria-hidden="true" />Add notice
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="p-3">Photo / content</th>
              <th className="p-3">Stop when</th>
              <th className="p-3">Order</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {notices.data?.map((n) => (
              <tr key={n.id} className="border-b border-line last:border-0">
                <td className="min-w-48 max-w-xs p-3">
                  <img src={n.imageUrl} alt="" className="mb-2 aspect-[3/2] w-24 rounded-md object-cover" />
                  <p className="line-clamp-3 break-words">{n.content}</p>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {n.stopConditions.map((c) => (
                      <span key={c} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-dark">
                        {conditionLabel[c] ?? c}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3">{n.sortOrder}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${n.active ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-muted text-muted'}`}>
                    {n.active ? 'Active' : 'Hidden'}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button title="Edit notice" aria-label="Edit notice" className={secondaryButtonClass} onClick={() => setEditing(n)} type="button">
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button title="Delete notice" aria-label="Delete notice" className={secondaryButtonClass} onClick={() => setDeletingId(n.id)} type="button">
                      <Trash2 className="size-4 text-red-600" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!notices.data?.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">No notices yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && <NoticeEditor notice={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <Dialog open={!!deletingId} onOpenChange={(o) => { if (!o && !deleting.isLoading) setDeletingId(null); }}>
        <DialogContent title="Delete notice?" description="This removes the notice and its display history.">
          <div className="flex justify-end gap-3">
            <button className={secondaryButtonClass} disabled={deleting.isLoading} onClick={() => setDeletingId(null)} type="button">Cancel</button>
            <button
              className={dangerButtonClass}
              disabled={deleting.isLoading}
              type="button"
              onClick={async () => {
                try {
                  await remove(deletingId!).unwrap();
                  setDeletingId(null);
                } catch {
                  setDeletingId(null);
                  setError('Unable to delete notice.');
                }
              }}
            >
              {deleting.isLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PhotoDropzone({
  preview,
  busy,
  onFile,
  onClear,
}: {
  preview: string;
  busy: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const selected = files?.[0];
    if (selected) onFile(selected);
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-bold">Photo (3:2, JPG, PNG or WebP, up to 8 MB)</span>
      {preview ? (
        <div className="relative aspect-[3/2] overflow-hidden rounded-lg border border-line bg-neutral-950">
          <img src={preview} alt="Notice preview" className="h-full w-full object-cover" />
          <button
            type="button"
            aria-label="Remove photo"
            title="Remove photo"
            disabled={busy}
            onClick={onClear}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-60"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-black/80 disabled:opacity-60"
          >
            <ImagePlus className="size-3.5" aria-hidden="true" />Replace
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? 'border-accent bg-accent-soft' : 'border-line bg-surface-muted hover:border-accent hover:bg-accent-soft/50'
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <UploadCloud className="size-8 text-muted" aria-hidden="true" />
          <span className="text-sm font-bold text-ink">Drag a photo here or click to browse</span>
          <span className="text-xs text-muted">3:2 aspect ratio works best -- JPG, PNG or WebP, up to 8 MB</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function NoticeEditor({ notice, onClose }: { notice: DykNotice | null; onClose: () => void }) {
  const [draft, setDraft] = useState<DykDraft>(() =>
    notice
      ? {
          content: notice.content,
          imageKey: notice.imageKey,
          imageBucket: notice.imageBucket,
          href: notice.href,
          stopConditions: notice.stopConditions,
          targetId: notice.targetId,
          active: notice.active,
          sortOrder: notice.sortOrder,
        }
      : { ...blank },
  );
  const [preview, setPreview] = useState(notice?.imageUrl ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [save] = useSaveDykMutation();
  const [upload] = useUploadDykMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleCondition(key: string) {
    setDraft((d) => ({
      ...d,
      stopConditions: d.stopConditions.includes(key)
        ? d.stopConditions.filter((c) => c !== key)
        : [...d.stopConditions, key],
    }));
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent title={notice ? 'Edit notice' : 'Create notice'} description="Do you know?">
        <form
          className="max-h-[70dvh] space-y-5 overflow-y-auto pr-1"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              if (draft.stopConditions.length === 0) throw new Error('Choose at least one stop condition.');
              let body = { ...draft, targetId: draft.stopConditions.includes('COURSE') ? draft.targetId : undefined };
              if (file) {
                const signed = await upload(file.type).unwrap();
                const response = await fetch(signed.uploadUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': file.type },
                  body: file,
                });
                if (!response.ok) throw new Error('Photo upload failed. Please retry.');
                body = { ...body, imageKey: signed.key, imageBucket: signed.bucket };
              }
              if (!body.imageKey) throw new Error('Choose a photo.');
              await save({ id: notice?.id, body }).unwrap();
              onClose();
            } catch (err) {
              const message = err as { data?: { message?: unknown }; message?: string };
              setError(typeof message.data?.message === 'string' ? message.data.message : (message.message ?? 'Unable to save notice. Please retry.'));
            } finally {
              setBusy(false);
            }
          }}
        >
          <PhotoDropzone
            preview={preview}
            busy={busy}
            onFile={(selected) => {
              if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 8 * 1024 * 1024) {
                setError('Choose a JPG, PNG or WebP photo up to 8 MB.');
                return;
              }
              setFile(selected);
              setError('');
              const reader = new FileReader();
              reader.onload = () => setPreview(String(reader.result));
              reader.readAsDataURL(selected);
            }}
            onClear={() => {
              setFile(null);
              setPreview('');
              setDraft((d) => ({ ...d, imageKey: '', imageBucket: '' }));
            }}
          />
          {preview && (
            <div className="relative aspect-[3/2] overflow-hidden rounded-lg bg-neutral-950">
              <img src={preview} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 pt-10 text-white">
                <p className="text-lg font-black">Do you know?</p>
                <p className="line-clamp-3 break-words text-sm">{draft.content || 'Your notice content will appear here.'}</p>
              </div>
            </div>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Content</span>
            <textarea required maxLength={220} rows={3} className={input} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Try it Now destination</span>
            <input required maxLength={500} className={input} value={draft.href} onChange={(e) => setDraft({ ...draft, href: e.target.value })} />
          </label>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-bold">Stop showing when (any one applies)</legend>
            <div className="grid gap-1.5 rounded-lg border border-line p-3 sm:grid-cols-2">
              {DYK_CONDITIONS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.stopConditions.includes(key)}
                    onChange={() => toggleCondition(key)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {draft.stopConditions.includes('COURSE') && (
            <label className="block space-y-1.5">
              <span className="text-sm font-bold">Course ID</span>
              <input required className={input} value={draft.targetId ?? ''} onChange={(e) => setDraft({ ...draft, targetId: e.target.value })} />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Display order</span>
            <input required type="number" min={0} max={10000} className={input} value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Active
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>Cancel</button>
            <button disabled={busy} className={primaryButtonClass} type="submit">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{busy ? 'Saving...' : 'Save notice'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

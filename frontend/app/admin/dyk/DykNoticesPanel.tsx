'use client';

import { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import {
  DykDraft,
  DykNotice,
  useAdminDykQuery,
  useDeleteDykMutation,
  useSaveDykMutation,
  useUploadDykMutation,
} from '@/store/dyk-api';

const conditions: Record<string, string> = {
  CLICKED: 'Clicked Try it Now',
  PHONE: 'Phone verified',
  KYC: 'Identity approved',
  PWA: 'Web app installed',
  REFERRAL_SHARE: 'Referral ad shared',
  TRAINING: 'First recording submitted',
  COURSE: 'Course completed',
  TESTIMONY: 'Testimony submitted',
  QRAC: 'QRAC signed',
};
const blank: DykDraft = {
  content: '',
  imageKey: '',
  imageBucket: '',
  href: '/dashboard',
  stopCondition: 'CLICKED',
  active: true,
  sortOrder: 0,
};
const input = 'w-full rounded-md border border-line bg-white p-2 text-ink';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line px-3 py-2 disabled:opacity-50';

/** Notice CRUD only -- photo, content, destination, stop condition, ordering. Platform-wide gates (on/off, interval, max displays) live on the admin settings "Do you know?" tab instead (DykSettingsPanel). */
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
        Unable to load notices. <button className={button} onClick={() => notices.refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Notices</h2>
        <button className={`${button} bg-primary text-white`} onClick={() => setEditing('new')}>
          <Plus className="size-4" />Add notice
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="p-2">Photo / content</th>
              <th className="p-2">Stop when</th>
              <th className="p-2">Order</th>
              <th className="p-2">Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {notices.data?.map((n) => (
              <tr key={n.id} className="border-b border-line">
                <td className="min-w-48 max-w-xs p-2">
                  <img src={n.imageUrl} alt="" className="mb-2 aspect-[3/2] w-24 rounded object-cover" />
                  <p className="line-clamp-3 break-words">{n.content}</p>
                </td>
                <td className="p-2">{conditions[n.stopCondition]}</td>
                <td className="p-2">{n.sortOrder}</td>
                <td className="p-2">{n.active ? 'Active' : 'Hidden'}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <button title="Edit notice" aria-label="Edit notice" className={button} onClick={() => setEditing(n)}>
                      <Pencil className="size-4" />
                    </button>
                    <button title="Delete notice" aria-label="Delete notice" className={button} onClick={() => setDeletingId(n.id)}>
                      <Trash2 className="size-4 text-red-600" />
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
          <div className="flex gap-3">
            <button className={button} disabled={deleting.isLoading} onClick={() => setDeletingId(null)}>Cancel</button>
            <button
              className={`${button} bg-red-700 text-white`}
              disabled={deleting.isLoading}
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
              {deleting.isLoading && <Loader2 className="size-4 animate-spin" />}Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
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
          stopCondition: notice.stopCondition,
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

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent title={notice ? 'Edit notice' : 'Create notice'} description="Do you know?">
        <form
          className="max-h-[70dvh] space-y-4 overflow-y-auto pr-1"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              let body = { ...draft, targetId: draft.stopCondition === 'COURSE' ? draft.targetId : undefined };
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
          {preview && (
            <div className="relative aspect-[3/2] overflow-hidden rounded-md bg-neutral-900">
              <img src={preview} alt="Notice preview" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-white">
                <p className="font-bold">Do you know?</p>
                <p className="line-clamp-3 break-words text-sm">{draft.content}</p>
              </div>
            </div>
          )}
          <label className="block space-y-1">
            <span className="flex items-center gap-2"><Upload className="size-4" />Photo (3:2, JPG, PNG or WebP, up to 8 MB)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              className="block w-full text-sm"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (!selected) return;
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 8 * 1024 * 1024) {
                  setError('Choose a JPG, PNG or WebP photo up to 8 MB.');
                  e.target.value = '';
                  return;
                }
                setFile(selected);
                setError('');
                const reader = new FileReader();
                reader.onload = () => setPreview(String(reader.result));
                reader.readAsDataURL(selected);
              }}
            />
          </label>
          <label className="block space-y-1">
            <span>Content</span>
            <textarea required maxLength={220} rows={3} className={input} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span>Try it Now destination</span>
            <input required maxLength={500} className={input} value={draft.href} onChange={(e) => setDraft({ ...draft, href: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span>Stop showing when</span>
            <select className={input} value={draft.stopCondition} onChange={(e) => setDraft({ ...draft, stopCondition: e.target.value })}>
              {Object.entries(conditions).map(([key, label]) => (
                <option value={key} key={key}>{label}</option>
              ))}
            </select>
          </label>
          {draft.stopCondition === 'COURSE' && (
            <label className="block space-y-1">
              <span>Course ID</span>
              <input required className={input} value={draft.targetId ?? ''} onChange={(e) => setDraft({ ...draft, targetId: e.target.value })} />
            </label>
          )}
          <label className="block space-y-1">
            <span>Display order</span>
            <input required type="number" min={0} max={10000} className={input} value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Active
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button type="button" className={button} disabled={busy} onClick={onClose}>Cancel</button>
            <button disabled={busy} className={`${button} bg-primary text-white`}>
              {busy && <Loader2 className="size-4 animate-spin" />}{busy ? 'Saving...' : 'Save notice'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

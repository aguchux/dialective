'use client';

import { FormEvent, useState } from 'react';
import { Send } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  SystemUpdateKind,
  normalizeErrorMessage,
  useCreateSystemUpdateMutation,
  useGetAdminSystemUpdatesQuery,
} from '@/store/api';
import { formatDateTime } from '@/components/dashboard/shared';

const kinds: { value: SystemUpdateKind; label: string; description: string }[] = [
  { value: 'MESSAGE', label: 'Message', description: 'General inbox message for all active users.' },
  { value: 'MAINTENANCE', label: 'Maintenance', description: 'Platform maintenance or outage notice for all active users.' },
  { value: 'BLOG', label: 'Blog', description: 'Manual blog/news alert for users opted into Blog & News.' },
  { value: 'COURSE', label: 'Course', description: 'Manual course alert for users opted into Courses.' },
];

export default function AdminUpdatesPage() {
  const { data: updates, isLoading } = useGetAdminSystemUpdatesQuery();
  const [createUpdate, { isLoading: isSending }] = useCreateSystemUpdateMutation();
  const [kind, setKind] = useState<SystemUpdateKind>('MESSAGE');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [href, setHref] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    try {
      const result = await createUpdate({
        kind,
        title: title.trim(),
        message: message.trim(),
        ...(href.trim() ? { href: href.trim() } : {}),
      }).unwrap();
      setNotice(`Update sent to ${result.recipients.toLocaleString()} recipient${result.recipients === 1 ? '' : 's'}.`);
      setTitle('');
      setMessage('');
      setHref('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to send this update.'));
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header>
          <h1 className="text-3xl font-black">Updates</h1>
          <p className="mt-1 text-muted">Send platform updates into user notification inboxes.</p>
        </header>

        <section className="grid gap-5 rounded-lg border border-line bg-white p-5 shadow-[0_8px_24px_rgba(31,25,41,0.04)]">
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase text-muted" htmlFor="update-kind">Update type</label>
              <select
                className="min-h-11 rounded-lg border border-line bg-white px-3 font-bold outline-none focus:border-accent"
                id="update-kind"
                onChange={(event) => setKind(event.target.value as SystemUpdateKind)}
                value={kind}
              >
                {kinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <p className="text-sm text-muted">{kinds.find((item) => item.value === kind)?.description}</p>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase text-muted" htmlFor="update-title">Title</label>
              <input
                className="min-h-11 rounded-lg border border-line bg-white px-3 font-bold outline-none focus:border-accent"
                id="update-title"
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase text-muted" htmlFor="update-message">Message</label>
              <textarea
                className="min-h-32 resize-y rounded-lg border border-line bg-white px-3 py-3 font-medium outline-none focus:border-accent"
                id="update-message"
                maxLength={2000}
                onChange={(event) => setMessage(event.target.value)}
                required
                value={message}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase text-muted" htmlFor="update-link">Related link</label>
              <input
                className="min-h-11 rounded-lg border border-line bg-white px-3 font-bold outline-none focus:border-accent"
                id="update-link"
                onChange={(event) => setHref(event.target.value)}
                placeholder="/blog/example or /learn/course"
                value={href}
              />
            </div>
            {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-bold text-emerald-700">{notice}</p>}
            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-bold text-danger">{error}</p>}
            <ActionButton
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              pending={isSending}
              pendingLabel="Sending"
              type="submit"
            >
              <Send className="size-4" aria-hidden="true" />
              Send update
            </ActionButton>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-xl font-black">Recent updates</h2>
          </div>
          {isLoading && <p className="p-5 text-muted">Loading updates...</p>}
          {updates?.length === 0 && <p className="p-5 text-muted">No updates have been sent yet.</p>}
          {updates?.map((update) => (
            <article className="grid gap-1 border-b border-line px-5 py-4 last:border-b-0" key={update.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-black">{update.title}</h3>
                <span className="rounded-full bg-accent-soft px-2 py-1 text-xs font-black uppercase text-accent">{update.kind}</span>
              </div>
              <p className="text-sm text-muted">{update.message}</p>
              <p className="text-xs font-bold text-muted">
                {formatDateTime(update.createdAt)} · {update._count.notifications.toLocaleString()} recipient{update._count.notifications === 1 ? '' : 's'}
              </p>
            </article>
          ))}
        </section>
      </div>
    </AdminShell>
  );
}

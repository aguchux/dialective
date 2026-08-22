'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck, Inbox, MoveUpRight } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { formatDateTime } from '@/components/dashboard/shared';
import {
  UserNotification,
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/store/api';

/**
 * The full notification inbox: paginated list + a read dialog. Shared by
 * every role's /notifications route so the page always renders inside that
 * role's own dashboard shell (header, nav, NotificationBell) instead of a
 * bare full-screen layout. Row text is clamped since the list is meant to
 * stay scannable -- the dialog is where the full message and any
 * call-to-action link live.
 */
export function NotificationListPanel() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<UserNotification | null>(null);
  const { data, isLoading } = useGetNotificationsQuery({ page });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();

  function openNotification(notification: UserNotification) {
    if (!notification.readAt)
      void markRead(notification.id)
        .unwrap()
        .catch(() => undefined);
    setOpen(notification);
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <div>
          <h1 className="text-3xl font-black">Notifications</h1>
          <p className="mt-1 text-muted">
            Updates, messages, courses, and blog alerts sent to your inbox.
          </p>
        </div>
        <ActionButton
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-bold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!data?.unreadCount}
          onClick={() => void markAllRead()}
          pending={markingAll}
          pendingLabel="Marking"
          type="button"
        >
          <CheckCheck className="size-4" aria-hidden="true" />
          Mark all read
        </ActionButton>
      </header>

      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        {isLoading && <p className="p-6 text-muted">Loading notifications...</p>}
        {!isLoading && data?.items.length === 0 && (
          <div className="grid min-h-72 place-items-center p-6 text-center">
            <div className="grid justify-items-center gap-3">
              <span className="grid size-12 place-items-center rounded-lg bg-surface-muted text-muted">
                <Inbox className="size-6" aria-hidden="true" />
              </span>
              <p className="font-black">No notifications yet</p>
            </div>
          </div>
        )}
        {data?.items.map((notification) => (
          <button
            className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-line px-4 py-4 text-left last:border-b-0 hover:bg-surface-muted"
            key={notification.id}
            onClick={() => openNotification(notification)}
            onMouseEnter={() => {
              if (!notification.readAt) void markRead(notification.id);
            }}
            type="button"
          >
            <span
              className={`mt-2 size-2 rounded-full ${notification.readAt ? 'bg-line' : 'bg-accent'}`}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-xs font-black uppercase text-accent">
                {labelFor(notification.update.kind)}
              </span>
              <span className="mt-1 line-clamp-1 block text-lg font-black">
                {notification.update.title}
              </span>
              <span className="mt-1 line-clamp-1 block leading-relaxed text-muted">
                {notification.update.message}
              </span>
              <span className="mt-2 block text-xs font-bold text-muted">
                {formatDateTime(notification.createdAt)}
              </span>
            </span>
            {notification.update.href && (
              <MoveUpRight className="mt-1 size-5 text-muted" aria-hidden="true" />
            )}
          </button>
        ))}
        {data && data.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <p className="text-sm font-bold text-muted">
              Page {data.page} of {data.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                className="min-h-10 rounded-lg border border-line px-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={data.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                className="min-h-10 rounded-lg border border-line px-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      <NotificationDialog notification={open} onOpenChange={(next) => !next && setOpen(null)} />
    </div>
  );
}

function NotificationDialog({
  notification,
  onOpenChange,
}: {
  notification: UserNotification | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  function followLink() {
    if (!notification?.update.href) return;
    const href = notification.update.href;
    onOpenChange(false);
    if (/^https?:\/\//i.test(href)) {
      window.location.href = href;
      return;
    }
    router.push(href);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={!!notification}>
      {notification && (
        <DialogContent
          title={notification.update.title}
          description={formatDateTime(notification.createdAt)}
        >
          <div className="grid gap-4">
            <span className="w-fit text-xs font-black uppercase text-accent">
              {labelFor(notification.update.kind)}
            </span>
            <p className="whitespace-pre-wrap leading-relaxed text-ink">
              {notification.update.message}
            </p>
            {notification.update.href && (
              <button
                className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg border border-accent bg-accent px-4 font-bold text-white hover:bg-accent-dark"
                onClick={followLink}
                type="button"
              >
                View <MoveUpRight className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function labelFor(kind: UserNotification['update']['kind']) {
  if (kind === 'MAINTENANCE') return 'Maintenance';
  if (kind === 'COURSE') return 'Course';
  if (kind === 'BLOG') return 'Blog';
  return 'Message';
}

'use client';

import { Bell, CheckCheck, Inbox, MoveUpRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { formatDateTime } from '@/components/dashboard/shared';
import {
  UserNotification,
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/store/api';

export function NotificationBell() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data } = useGetNotificationsQuery({ page: 1 }, { pollingInterval: 60000 });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items.slice(0, 6) ?? [];
  const role = session?.user?.role;
  const inboxHref =
    role === 'TRAINER' || role === 'PARTNER' ? '/dashboard?view=notifications' : '/notifications';

  async function openNotification(notification: UserNotification) {
    if (!notification.readAt) {
      await markRead(notification.id)
        .unwrap()
        .catch(() => undefined);
    }
    const href = notification.update.href;
    if (!href) {
      router.push(inboxHref);
      return;
    }
    if (/^https?:\/\//i.test(href)) {
      window.location.href = href;
      return;
    }
    router.push(href);
  }

  function touchRead(notification: UserNotification) {
    if (notification.readAt) return;
    void markRead(notification.id);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative grid size-10 place-items-center rounded-lg border border-line bg-surface text-ink transition-colors hover:bg-surface-muted"
          type="button"
          aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-black leading-5 text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[min(92vw,380px)]">
        <DropdownMenuLabel className="flex items-center justify-between gap-3 px-2.5 py-2">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <button
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-accent hover:bg-accent-soft"
              disabled={markingAll}
              onClick={(event) => {
                event.preventDefault();
                void markAllRead();
              }}
              type="button"
            >
              <CheckCheck className="size-3.5" aria-hidden="true" />
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="grid gap-2 px-4 py-8 text-center text-sm text-muted">
            <Inbox className="mx-auto size-7" aria-hidden="true" />
            <p className="font-bold text-ink">No notifications yet</p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto py-1">
            {items.map((notification) => (
              <DropdownMenuItem
                className="items-start gap-3 px-3 py-3"
                key={notification.id}
                onMouseEnter={() => touchRead(notification)}
                onSelect={(event) => {
                  event.preventDefault();
                  void openNotification(notification);
                }}
              >
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${notification.readAt ? 'bg-line' : 'bg-accent'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 block font-black text-ink">
                    {notification.update.title}
                  </span>
                  <span className="line-clamp-2 block text-xs leading-relaxed text-muted">
                    {notification.update.message}
                  </span>
                  <span className="mt-1 block text-[11px] font-bold uppercase text-muted">
                    {formatDateTime(notification.createdAt)}
                  </span>
                </span>
                {notification.update.href && (
                  <MoveUpRight className="mt-1 size-4 shrink-0 text-muted" aria-hidden="true" />
                )}
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(inboxHref)}>
          <Inbox className="size-4" aria-hidden="true" />
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

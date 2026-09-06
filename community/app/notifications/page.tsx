'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AtSign, Bell, Megaphone, MessageCircle, ShieldCheck } from 'lucide-react';
import {
  useListNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  type CommunityNotification,
} from '@/store/api';
import { CommunityAvatar } from '@/components/community-content';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  PageHeading,
  PrimaryButton,
  SegmentedTabs,
  StatusBanner,
} from '@/components/ui';
import { formatRelativeTime, getNotificationLabel } from '@/lib/community-format';

type NotificationTab = 'all' | 'replies' | 'mentions' | 'announcements';

const ICONS = {
  reply: MessageCircle,
  mention: AtSign,
  announcement: Megaphone,
  moderation: ShieldCheck,
};

function notificationCategory(notification: CommunityNotification): NotificationTab {
  if (notification.type === 'MENTION') return 'mentions';
  if (notification.type === 'ANNOUNCEMENT' || notification.type === 'MODERATION_ACTION')
    return 'announcements';
  return 'replies';
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<NotificationTab>('all');
  const [feedback, setFeedback] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useListNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
  const items = useMemo(
    () =>
      (data ?? []).filter(
        (notification) => tab === 'all' || notificationCategory(notification) === tab,
      ),
    [data, tab],
  );
  const unreadCount = data?.filter((notification) => !notification.readAt).length ?? 0;

  async function handleMarkAllRead() {
    setFeedback(null);
    try {
      await markAllRead().unwrap();
      setFeedback('All notifications marked as read.');
    } catch {
      setFeedback('Could not update notifications. Please try again.');
    }
  }

  return (
    <PageFrame className="max-w-[1040px]">
      <PageHeading
        action={
          unreadCount > 0 ? (
            <PrimaryButton
              onClick={() => void handleMarkAllRead()}
              pending={markingAll}
              pendingLabel="Marking read"
              type="button"
            >
              Mark all as read
            </PrimaryButton>
          ) : undefined
        }
        icon={<Bell aria-hidden="true" className="size-6" />}
        subtitle="Replies, mentions, and community updates in one place."
        title="Notifications"
      />
      {feedback && (
        <div className="mb-4">
          <StatusBanner tone={feedback.startsWith('Could') ? 'danger' : 'success'}>
            {feedback}
          </StatusBanner>
        </div>
      )}
      <div className="mb-5 max-w-2xl">
        <SegmentedTabs
          ariaLabel="Notification filters"
          items={[
            { key: 'all', label: 'All' },
            { key: 'replies', label: 'Replies' },
            { key: 'mentions', label: 'Mentions' },
            { key: 'announcements', label: 'Announcements' },
          ]}
          onChange={setTab}
          value={tab}
        />
      </div>
      {isLoading ? (
        <LoadingState label="Loading notifications" />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} retryLabel="Retry loading notifications" />
      ) : items.length ? (
        <div className="grid gap-3">
          {items.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onRead={() => {
                if (!notification.readAt) void markRead(notification.id);
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          description="New replies, mentions, and announcements will appear here."
          title="No notifications"
        />
      )}
    </PageFrame>
  );
}

function NotificationCard({
  notification,
  onRead,
}: {
  notification: CommunityNotification;
  onRead: () => void;
}) {
  const actor = notification.actor?.displayName ?? 'Dialect Library';
  const Icon =
    notification.type === 'MENTION'
      ? ICONS.mention
      : notification.type === 'ANNOUNCEMENT'
        ? ICONS.announcement
        : notification.type === 'MODERATION_ACTION'
          ? ICONS.moderation
          : ICONS.reply;
  const content = (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${notification.readAt ? 'border-line bg-surface' : 'border-accent/30 bg-accent-soft/35'}`}
    >
      <CommunityAvatar name={actor} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-ink">
          <span className="font-black">{actor}</span> {getNotificationLabel(notification.type)}
        </p>
        <p className="mt-1 text-xs font-semibold text-muted">
          {formatRelativeTime(notification.createdAt)}
        </p>
        {notification.postId && (
          <span className="mt-3 inline-flex min-h-9 items-center rounded-md bg-surface-muted px-3 py-1 text-xs font-extrabold text-accent">
            View discussion
          </span>
        )}
      </div>
      <Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent" />
    </div>
  );
  return notification.postId ? (
    <Link
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
      href={`/post/${notification.postId}`}
      onClick={onRead}
    >
      {content}
    </Link>
  ) : (
    <button
      aria-label={`Mark notification from ${actor} as read`}
      className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
      onClick={onRead}
      type="button"
    >
      {content}
    </button>
  );
}

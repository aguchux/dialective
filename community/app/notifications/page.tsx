'use client';

import Link from 'next/link';
import {
  useListNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/store/api';
import { Card, PageHeading, SecondaryButton } from '@/components/ui';

const LABELS: Record<string, string> = {
  REPLY_TO_POST: 'replied to your post',
  REPLY_TO_REPLY: 'replied to your reply',
  MENTION: 'mentioned you',
  ANNOUNCEMENT: 'posted an announcement',
  MODERATION_ACTION: 'took a moderation action on your content',
};

export default function NotificationsPage() {
  const { data } = useListNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading title="Notifications" subtitle="Stay updated with the latest activity in the community." />
        {(data?.length ?? 0) > 0 && (
          <SecondaryButton disabled={markingAll} onClick={() => void markAllRead()} type="button">
            Mark all read
          </SecondaryButton>
        )}
      </div>

      {(data?.length ?? 0) === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">You&apos;re all caught up.</p>
        </Card>
      ) : (
        <div className="grid gap-2">
          {data!.map((n) => {
            const target = n.postId ? `/post/${n.postId}` : undefined;
            const content = (
              <Card
                className={`p-3.5 transition-colors ${!n.readAt ? 'border-accent bg-accent-soft/40' : ''}`}
              >
                <p className="text-sm text-ink">
                  {n.actor && <span className="font-bold">{n.actor.displayName}</span>}{' '}
                  {LABELS[n.type] ?? 'has an update'}
                </p>
              </Card>
            );
            return (
              <div key={n.id} onClick={() => !n.readAt && markRead(n.id)}>
                {target ? <Link href={target}>{content}</Link> : content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

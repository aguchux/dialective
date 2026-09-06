import type { CommunityBadge, CommunityNotification, CommunityRole } from '@/store/api';

export type SpaceTone = 'blue' | 'purple' | 'mint' | 'green' | 'pink' | 'orange';

export function formatRelativeTime(value: string, now = Date.now()): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: timestamp < now - 31536000000 ? 'numeric' : undefined,
  }).format(timestamp);
}

export function formatDate(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(timestamp);
}

export function formatCompactCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1000000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return `${(value / 1000000).toFixed(1)}M`;
}

export function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function getRoleLabel(badge: CommunityBadge | CommunityRole | null | undefined): string {
  switch (badge) {
    case 'VERIFIED_TRAINER':
      return 'Verified Trainer';
    case 'DISTRIBUTOR':
      return 'Distributor';
    case 'MODERATOR':
      return 'Moderator';
    case 'STAFF':
      return 'Team';
    case 'MEMBER':
    default:
      return 'Community Member';
  }
}

export function getNotificationLabel(type: CommunityNotification['type']): string {
  switch (type) {
    case 'REPLY_TO_POST':
      return 'replied to your post';
    case 'REPLY_TO_REPLY':
      return 'replied to your reply';
    case 'MENTION':
      return 'mentioned you';
    case 'ANNOUNCEMENT':
      return 'posted an announcement';
    case 'MODERATION_ACTION':
      return 'took a moderation action on your content';
  }
}

export function getPostExcerpt(body: string, maxLength = 190): string {
  const text = body
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

export function getSpaceTone(slug: string): SpaceTone {
  const normalized = slug.toLowerCase();
  if (normalized.includes('record')) return 'mint';
  if (normalized.includes('validation') || normalized.includes('isvp')) return 'green';
  if (normalized.includes('stream') || normalized.includes('voice')) return 'blue';
  if (normalized.includes('research') || normalized.includes('ai')) return 'pink';
  if (normalized.includes('support') || normalized.includes('help')) return 'orange';
  return 'purple';
}

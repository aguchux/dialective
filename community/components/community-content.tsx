'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Bookmark,
  CalendarDays,
  Check,
  Eye,
  FileText,
  Globe2,
  Hash,
  GraduationCap,
  Heart,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type {
  CommunityBadge,
  CommunityPostAuthor,
  CommunityPostCard,
  CommunityReply,
  CommunityRole,
  CommunitySpace,
} from '@/store/api';
import { Badge, Card, OverflowMenu, PrimaryButton, SecondaryButton, type OverflowMenuItem } from '@/components/ui';
import {
  formatCompactCount,
  formatRelativeTime,
  getInitials,
  getPostExcerpt,
  getRoleLabel,
  getSpaceTone,
  type SpaceTone,
} from '@/lib/community-format';

const TONE_CLASSES: Record<SpaceTone, { box: string; text: string }> = {
  blue: { box: 'bg-space-blue', text: 'text-space-blue-ink' },
  purple: { box: 'bg-space-purple', text: 'text-space-purple-ink' },
  mint: { box: 'bg-space-mint', text: 'text-space-mint-ink' },
  green: { box: 'bg-space-green', text: 'text-space-green-ink' },
  pink: { box: 'bg-space-pink', text: 'text-space-pink-ink' },
  orange: { box: 'bg-space-orange', text: 'text-space-orange-ink' },
};

export function CommunityAvatar({
  name,
  size = 'md',
  tone = 'purple',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: SpaceTone;
}) {
  const sizes = {
    sm: 'size-9 text-xs',
    md: 'size-11 text-sm',
    lg: 'size-14 text-lg',
    xl: 'size-24 text-3xl sm:size-28 sm:text-4xl',
  };
  const toneStyles = TONE_CLASSES[tone];

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-black ${sizes[size]} ${toneStyles.box} ${toneStyles.text}`}
    >
      {getInitials(name)}
    </span>
  );
}

export function RoleBadge({
  badge,
  role,
  className = '',
}: {
  badge?: CommunityBadge;
  role?: CommunityRole;
  className?: string;
}) {
  const value = badge ?? role ?? 'MEMBER';
  const tone = value === 'MODERATOR' ? 'danger' : value === 'STAFF' ? 'info' : 'accent';
  const Icon =
    value === 'VERIFIED_TRAINER'
      ? GraduationCap
      : value === 'STAFF' || value === 'MODERATOR'
        ? ShieldCheck
        : Users;
  return (
    <Badge className={className} tone={tone}>
      <Icon aria-hidden="true" className="size-3.5" />
      {getRoleLabel(value)}
    </Badge>
  );
}

export function PostMeta({
  author,
  createdAt,
  space,
  showSpace = true,
}: {
  author: CommunityPostAuthor;
  createdAt: string;
  space?: { name: string; slug: string };
  showSpace?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <CommunityAvatar name={author.displayName} size="md" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="truncate text-sm font-black text-ink hover:text-accent"
            href={`/u/${author.id}`}
          >
            {author.displayName}
          </Link>
          <RoleBadge badge={author.badge} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted">
          <span>{formatRelativeTime(createdAt)}</span>
          {showSpace && space && (
            <>
              <span aria-hidden="true">·</span>
              <Link
                className="truncate hover:text-accent hover:underline"
                href={`/spaces/${space.slug}`}
              >
                {space.name}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PostTags({ tags }: { tags: { id: string; name: string; slug: string }[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.slice(0, 5).map((tag) => (
        <Link
          className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-dark transition-colors hover:bg-accent hover:text-white"
          href={`/explore?tag=${encodeURIComponent(tag.slug)}`}
          key={tag.id}
        >
          #{tag.name.replace(/^#/, '')}
        </Link>
      ))}
    </div>
  );
}

export function PostMetrics({
  post,
  onLike,
  onBookmark,
  showViews = true,
  showBookmark = true,
}: {
  post: CommunityPostCard;
  onLike?: () => void;
  onBookmark?: () => void;
  showViews?: boolean;
  showBookmark?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 text-sm font-bold text-muted">
      {onLike ? (
        <button
          aria-label={post.likedByMe ? 'Unlike post' : 'Like post'}
          aria-pressed={post.likedByMe}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${post.likedByMe ? 'text-accent' : ''}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onLike();
          }}
          type="button"
        >
          <Heart
            aria-hidden="true"
            className="size-5"
            fill={post.likedByMe ? 'currentColor' : 'none'}
          />
          <span>{formatCompactCount(post.likeCount)}</span>
        </button>
      ) : (
        <span className="inline-flex min-h-11 items-center gap-1.5">
          <Heart aria-hidden="true" className="size-5" />
          {formatCompactCount(post.likeCount)}
        </span>
      )}
      <span className="inline-flex min-h-11 items-center gap-1.5">
        <MessageCircle aria-hidden="true" className="size-5" />
        {formatCompactCount(post.replyCount)}
      </span>
      {showViews && (
        <span className="hidden min-h-11 items-center gap-1.5 sm:inline-flex">
          <Eye aria-hidden="true" className="size-5" />
          {formatCompactCount(post.viewCount)}
        </span>
      )}
      {showBookmark && onBookmark && (
        <button
          aria-label={post.bookmarkedByMe ? 'Remove bookmark' : 'Bookmark post'}
          aria-pressed={post.bookmarkedByMe}
          className={`ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${post.bookmarkedByMe ? 'text-accent' : ''}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onBookmark();
          }}
          type="button"
        >
          <Bookmark
            aria-hidden="true"
            className="size-5"
            fill={post.bookmarkedByMe ? 'currentColor' : 'none'}
          />
          <span className="hidden sm:inline">{post.bookmarkedByMe ? 'Saved' : 'Save'}</span>
        </button>
      )}
    </div>
  );
}

/**
 * Standard edit/delete/report/copy-link menu shared by post cards, the post
 * detail header, and reply cards -- the mockups show a "⋮" on every one of
 * these, and edit/delete already had full backend + RTK Query support with
 * no UI ever calling them before this.
 */
export function buildContentOverflowItems({
  isOwner,
  onEdit,
  onDelete,
  onReport,
  onCopyLink,
}: {
  isOwner: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onCopyLink?: () => void;
}): OverflowMenuItem[] {
  return [
    { label: 'Copy link', onSelect: () => onCopyLink?.(), hidden: !onCopyLink },
    { label: 'Edit', onSelect: () => onEdit?.(), hidden: !isOwner || !onEdit },
    { label: 'Delete', onSelect: () => onDelete?.(), tone: 'danger', hidden: !isOwner || !onDelete },
    { label: 'Report', onSelect: () => onReport?.(), tone: 'danger', hidden: isOwner || !onReport },
  ];
}

export function PostCard({
  post,
  compact = false,
  showSpace = true,
  showBookmarkFooter = false,
  onLike,
  onBookmark,
  status,
  overflowItems,
}: {
  post: CommunityPostCard;
  compact?: boolean;
  showSpace?: boolean;
  showBookmarkFooter?: boolean;
  onLike?: () => void;
  onBookmark?: () => void;
  status?: 'PUBLISHED' | 'DRAFT';
  overflowItems?: OverflowMenuItem[];
}) {
  return (
    <Card className={`overflow-hidden ${compact ? 'p-4' : 'p-4 sm:p-5'}`}>
      <div className="flex items-start gap-3">
        <PostMeta author={post.author} createdAt={post.createdAt} showSpace={false} />
        {overflowItems && (
          <div className="ml-auto -mr-2 -mt-2">
            <OverflowMenu items={overflowItems} label="Post actions" />
          </div>
        )}
      </div>
      <Link className="mt-4 block sm:ml-[58px]" href={`/post/${post.slug}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {showSpace && <Badge tone="muted">{post.space.name}</Badge>}
          {status && <StatusChip status={status} />}
        </div>
        <h2
          className={`${compact ? 'text-base' : 'text-lg sm:text-xl'} font-black leading-tight text-ink`}
        >
          {post.title}
        </h2>
        <p
          className={`${compact ? 'line-clamp-2' : 'line-clamp-3'} mt-2 text-sm leading-relaxed text-muted sm:text-base`}
        >
          {getPostExcerpt(post.body, compact ? 150 : 220)}
        </p>
        <div className="mt-4">
          <PostTags tags={post.tags} />
        </div>
      </Link>
      <div className="mt-4 border-t border-line pt-2 sm:ml-[58px]">
        {showBookmarkFooter ? (
          <div className="flex min-h-11 items-center gap-2 text-sm font-bold text-muted">
            <Bookmark aria-hidden="true" className="size-5 fill-accent text-accent" />
            Saved {formatRelativeTime(post.createdAt)}
          </div>
        ) : (
          <PostMetrics onBookmark={onBookmark} onLike={onLike} post={post} />
        )}
      </div>
    </Card>
  );
}

export function StatusChip({ status }: { status: 'PUBLISHED' | 'DRAFT' }) {
  return status === 'PUBLISHED' ? (
    <Badge tone="success">
      <Check aria-hidden="true" className="size-3.5" /> Published
    </Badge>
  ) : (
    <Badge tone="muted">
      <FileText aria-hidden="true" className="size-3.5" /> Draft
    </Badge>
  );
}

export function ReplyCard({
  reply,
  onLike,
  overflowItems,
}: {
  reply: CommunityReply;
  onLike?: () => void;
  overflowItems?: OverflowMenuItem[];
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <CommunityAvatar name={reply.author.displayName} size="md" tone="blue" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link className="font-black text-ink hover:text-accent" href={`/u/${reply.author.id}`}>
              {reply.author.displayName}
            </Link>
            <RoleBadge badge={reply.author.badge} />
            <span className="text-xs font-semibold text-muted">
              {formatRelativeTime(reply.createdAt)}
            </span>
            {overflowItems && (
              <div className="ml-auto">
                <OverflowMenu items={overflowItems} label="Reply actions" />
              </div>
            )}
          </div>
          <SafePostBody className="mt-3" html={reply.body} />
          {reply.attachments.length > 0 && (
            <AttachmentGallery attachments={reply.attachments} className="mt-3" />
          )}
          {onLike && (
            <div className="mt-3 flex items-center text-sm font-bold text-muted">
              <button
                aria-label={reply.likedByMe ? 'Unlike reply' : 'Like reply'}
                aria-pressed={reply.likedByMe}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${reply.likedByMe ? 'text-accent' : ''}`}
                onClick={onLike}
                type="button"
              >
                <Heart
                  aria-hidden="true"
                  className="size-4"
                  fill={reply.likedByMe ? 'currentColor' : 'none'}
                />
                {formatCompactCount(reply.likeCount)}
              </button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function SafePostBody({ html, className = '' }: { html: string; className?: string }) {
  return (
    <div
      className={`community-post-body ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function AttachmentGallery({
  attachments,
  className = '',
}: {
  attachments: { id: string; type: 'IMAGE' | 'AUDIO' | 'DOCUMENT'; url: string; originalName: string }[];
  className?: string;
}) {
  if (!attachments.length) return null;
  const images = attachments.filter((a) => a.type === 'IMAGE');
  const others = attachments.filter((a) => a.type !== 'IMAGE');

  return (
    <div className={`grid gap-3 ${className}`}>
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((attachment) => (
            // eslint-disable-next-line @next/next/no-img-element -- external Spaces URL, not an optimizable local asset
            <img
              alt={attachment.originalName}
              className="aspect-square w-full rounded-lg border border-line object-cover"
              key={attachment.id}
              src={attachment.url}
            />
          ))}
        </div>
      )}
      {others.map((attachment) =>
        attachment.type === 'AUDIO' ? (
          <audio className="w-full" controls key={attachment.id} src={attachment.url}>
            <track kind="captions" />
          </audio>
        ) : (
          <a
            className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 text-sm font-bold text-accent hover:underline"
            href={attachment.url}
            key={attachment.id}
            rel="noreferrer"
            target="_blank"
          >
            <FileText aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{attachment.originalName}</span>
          </a>
        ),
      )}
    </div>
  );
}

export function SpaceIcon({
  slug,
  icon: Icon = Hash,
  size = 'md',
}: {
  slug: string;
  icon?: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
}) {
  const tone = getSpaceTone(slug);
  const toneStyles = TONE_CLASSES[tone];
  const sizes = { sm: 'size-9', md: 'size-11', lg: 'size-16 sm:size-20' };
  const iconSizes = { sm: 'size-4', md: 'size-5', lg: 'size-8 sm:size-9' };
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl ${sizes[size]} ${toneStyles.box} ${toneStyles.text}`}
    >
      <Icon aria-hidden="true" className={iconSizes[size]} />
    </span>
  );
}

export function SpaceCard({
  space,
  postCount,
  onJoin,
  joining = false,
}: {
  space: CommunitySpace;
  postCount?: number;
  onJoin?: () => void;
  joining?: boolean;
}) {
  return (
    <Card className="flex items-center gap-3 p-3 sm:p-4">
      <SpaceIcon slug={space.slug} />
      <Link className="min-w-0 flex-1" href={`/spaces/${space.slug}`}>
        <p className="truncate font-black text-ink">{space.name}</p>
        <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted">
          {space.description ?? 'Join the conversation with the community.'}
        </p>
        {postCount !== undefined && (
          <p className="mt-1 text-xs font-bold text-muted">{formatCompactCount(postCount)} posts</p>
        )}
      </Link>
      {onJoin &&
        (space.joined ? (
          <SecondaryButton
            className="min-h-10 shrink-0 px-3.5"
            onClick={onJoin}
            pending={joining}
            pendingLabel="Leaving"
          >
            Leave
          </SecondaryButton>
        ) : (
          <PrimaryButton
            className="min-h-10 shrink-0 px-3.5"
            onClick={onJoin}
            pending={joining}
            pendingLabel="Joining"
          >
            Join
          </PrimaryButton>
        ))}
    </Card>
  );
}

export function ProfileStats({
  profile,
}: {
  profile: { postCount: number; replyCount: number; bookmarkCount: number };
}) {
  const stats = [
    { label: 'Posts', value: profile.postCount, icon: FileText },
    { label: 'Replies', value: profile.replyCount, icon: MessageCircle },
    { label: 'Bookmarks', value: profile.bookmarkCount, icon: Bookmark },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map(({ label, value, icon: Icon }) => (
        <div
          className="grid min-h-20 place-items-center rounded-xl bg-accent-soft/70 p-3 text-center"
          key={label}
        >
          <Icon aria-hidden="true" className="mb-1 size-5 text-accent" />
          <p className="text-xl font-black text-ink">{formatCompactCount(value)}</p>
          <p className="text-xs font-bold text-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}

export function ProfileHero({
  profile,
  editable = false,
  onEdit,
}: {
  profile: {
    displayName: string;
    bio: string | null;
    country: { name: string } | null;
    languages: string[];
    badge: CommunityBadge;
    role?: CommunityRole;
    postCount: number;
    replyCount: number;
    bookmarkCount: number;
    createdAt: string;
  };
  editable?: boolean;
  onEdit?: () => void;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <CommunityAvatar name={profile.displayName} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
                {profile.displayName}
              </h2>
              <div className="mt-2">
                <RoleBadge badge={profile.badge} role={profile.role} />
              </div>
            </div>
            {editable && (
              <SecondaryButton onClick={onEdit} type="button">
                Edit profile
              </SecondaryButton>
            )}
          </div>
          {profile.bio && (
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{profile.bio}</p>
          )}
          <div className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3">
            <ProfileMeta icon={MapPin} label="Country" value={profile.country?.name ?? 'Not set'} />
            <ProfileMeta
              icon={Globe2}
              label="Languages"
              value={profile.languages.length ? profile.languages.join(', ') : 'Not set'}
            />
            <ProfileMeta
              icon={CalendarDays}
              label="Member since"
              value={formatRelativeTime(profile.createdAt).replace(' ago', '') || 'Recently'}
            />
          </div>
        </div>
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <ProfileStats profile={profile} />
      </div>
    </Card>
  );
}

function ProfileMeta({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted" />
      <div className="min-w-0">
        <p className="truncate font-bold text-ink">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

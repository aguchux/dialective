'use client';

import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BrainCircuit,
  ChevronRight,
  Globe2,
  Megaphone,
  MessageCircle,
  Mic2,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import type { CommunityPostCard, CommunitySpace } from '@/store/api';
import { Card, PrimaryButton, SecondaryButton } from '@/components/ui';
import { SpaceIcon } from './community-content';
import { formatCompactCount } from '@/lib/community-format';

const SPACE_ICONS: Record<string, LucideIcon> = {
  language: Globe2,
  dialect: Globe2,
  recording: Mic2,
  voice: Mic2,
  validation: ShieldCheck,
  isvp: ShieldCheck,
  stream: Radio,
  research: BrainCircuit,
  ai: BrainCircuit,
  announcement: Megaphone,
};

function getSpaceIcon(slug: string): LucideIcon {
  const key = Object.keys(SPACE_ICONS).find((name) => slug.toLowerCase().includes(name));
  return key ? SPACE_ICONS[key] : Globe2;
}

export function TopicChips({
  items,
  active,
  onSelect,
}: {
  items: string[];
  active?: string;
  onSelect?: (value: string) => void;
}) {
  return (
    <div
      aria-label="Explore topics"
      className="scrollbar-hidden -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      role={onSelect ? 'group' : undefined}
    >
      {items.map((item) => {
        const selected = active === item;
        const content = (
          <span
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-bold transition-colors ${selected ? 'bg-accent text-white' : 'bg-accent-soft text-accent-dark hover:bg-accent hover:text-white'}`}
          >
            {item}
          </span>
        );
        return onSelect ? (
          <button aria-pressed={selected} key={item} onClick={() => onSelect(item)} type="button">
            {content}
          </button>
        ) : (
          <span key={item}>{content}</span>
        );
      })}
    </div>
  );
}

export function FeaturedBanner() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-line bg-accent-soft/45 p-5 shadow-community-card sm:p-7">
      <div className="relative z-10 max-w-2xl">
        <p className="text-sm font-black text-accent">Community discussions</p>
        <h2 className="mt-2 max-w-xl text-2xl font-black leading-tight text-ink sm:text-3xl">
          Find practical answers from people building language data.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
          Browse recording tips, validation notes, dialect questions, and updates from the Dialect
          Library community.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-accent bg-accent px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          href="/explore"
        >
          Browse discussions <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <div className="pointer-events-none absolute -right-8 -top-10 hidden size-48 rounded-full border-[22px] border-white/45 sm:block" />
    </section>
  );
}

export function SpaceGrid({ spaces }: { spaces: CommunitySpace[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {spaces.map((space) => (
        <Link className="group block h-full" href={`/spaces/${space.slug}`} key={space.id}>
          <Card className="h-full p-4 transition-colors group-hover:border-accent/40">
            <div className="flex items-start justify-between gap-3">
              <SpaceIcon icon={getSpaceIcon(space.slug)} slug={space.slug} />
              <ChevronRight aria-hidden="true" className="size-5 text-muted" />
            </div>
            <h3 className="mt-4 font-black text-ink">{space.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
              {space.description ?? 'Open discussions for community members.'}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function SpaceHero({
  space,
  onJoin,
  joining,
}: {
  space: CommunitySpace;
  onJoin?: () => void;
  joining?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden border-accent/20 bg-accent-soft/30 p-5 sm:p-7">
      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-start">
        <SpaceIcon icon={getSpaceIcon(space.slug)} size="lg" slug={space.slug} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-black leading-tight text-ink sm:text-3xl">
                {space.name}
              </h1>
              <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
                {space.description ?? 'A space for community discussion and shared learning.'}
              </p>
            </div>
            {onJoin &&
              (space.joined ? (
                <SecondaryButton
                  className="shrink-0"
                  onClick={onJoin}
                  pending={joining}
                  pendingLabel="Leaving"
                >
                  Leave
                </SecondaryButton>
              ) : (
                <PrimaryButton
                  className="shrink-0"
                  onClick={onJoin}
                  pending={joining}
                  pendingLabel="Joining"
                >
                  Join
                </PrimaryButton>
              ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm font-bold text-muted">
            <MessageCircle aria-hidden="true" className="size-4 text-accent" />
            <span>Open discussion space</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function TrendingList({ posts }: { posts: CommunityPostCard[] }) {
  if (!posts.length)
    return (
      <Card className="p-5 text-sm leading-relaxed text-muted">
        Trending discussions will appear as members start conversations.
      </Card>
    );
  return (
    <Card className="overflow-hidden">
      {posts.slice(0, 3).map((post, index) => (
        <Link
          className="group flex items-center gap-3 border-b border-line p-3.5 last:border-0 hover:bg-surface-muted sm:p-4"
          href={`/post/${post.slug}`}
          key={post.id}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-black text-accent">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-ink group-hover:text-accent">
              {post.title}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-muted">
              {formatCompactCount(post.replyCount)} replies
            </p>
          </div>
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted group-hover:text-accent"
          />
        </Link>
      ))}
    </Card>
  );
}

export function PopularTags({ tags }: { tags: { id: string; name: string; slug: string }[] }) {
  if (!tags.length)
    return (
      <Card className="p-5 text-sm leading-relaxed text-muted">
        Popular tags will appear as the community grows.
      </Card>
    );
  return (
    <Card className="flex flex-wrap content-start gap-2 p-4">
      {tags.slice(0, 12).map((tag) => (
        <Link
          className="rounded-full bg-accent-soft px-3 py-2 text-xs font-bold text-accent-dark hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          href={`/explore?tag=${tag.slug}`}
          key={tag.id}
        >
          #{tag.name.replace(/^#/, '')}
        </Link>
      ))}
    </Card>
  );
}

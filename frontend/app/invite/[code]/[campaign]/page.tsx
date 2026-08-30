import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import { ReferralInviteRedirect } from './ReferralInviteRedirect';

const referralShareOrigin =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://www.dialectlibrary.com';

interface ReferralCampaignPageProps {
  params: { code: string; campaign: string };
}

function isValidReferral(code: string, campaign: string): boolean {
  return (
    /^[A-Za-z0-9_-]{4,64}$/.test(code) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaign)
  );
}

interface CampaignShareHeadline {
  title: string;
  description: string;
  photoUrl: string;
}

async function getCampaignShare(shareId: string): Promise<CampaignShareHeadline | null> {
  try {
    const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/marketing/shares/${shareId}/headline`, {
      cache: 'no-store', // every fetch also records a view server-side -- must not be deduped/cached
    });
    if (!res.ok) return null;
    return (await res.json()) as CampaignShareHeadline;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: ReferralCampaignPageProps): Promise<Metadata> {
  if (!isValidReferral(params.code, params.campaign)) {
    return { title: 'Invitation not found', robots: { index: false, follow: false } };
  }

  const share = await getCampaignShare(params.campaign);
  if (!share) {
    return { title: 'Invitation not found', robots: { index: false, follow: false } };
  }

  const canonical = `${referralShareOrigin}/invite/${encodeURIComponent(params.code)}/${params.campaign}`;
  return {
    title: share.title,
    description: share.description,
    alternates: { canonical },
    // Per-trainer invite links are meant for social-share link previews
    // (hence the real OpenGraph/Twitter metadata below, which crawlers like
    // Facebook/Twitter's still fetch regardless of robots meta) -- not for
    // search indexing. Without this, every trainer's personal invite URL
    // would be a separately indexable page that just bounces visitors to
    // /register, diluting search relevance. See also robots.ts's /invite/
    // disallow rule (belt-and-suspenders: this stops indexing even if a
    // page gets crawled from an external link before disallow is honored).
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: 'Dialect Library',
      title: share.title,
      description: share.description,
      images: [{ url: share.photoUrl, width: 1200, height: 630, alt: 'Dialect Library' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: share.title,
      description: share.description,
      images: [share.photoUrl],
    },
  };
}

export default function ReferralCampaignPage({ params }: ReferralCampaignPageProps) {
  if (!isValidReferral(params.code, params.campaign)) notFound();
  return <ReferralInviteRedirect campaignShareId={params.campaign} code={params.code} />;
}

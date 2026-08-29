import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReferralInviteRedirect } from './ReferralInviteRedirect';

const campaigns = {
  earn: {
    title: 'Start Earning Real money on Dialect Library',
    description: 'Contribute voice in your dialect, help train AI, and earn for approved work.',
  },
  contribute: {
    title: 'Contribute voice in your Dialect, get paid',
    description: 'Record your local dialect and help make AI more useful for every community.',
  },
  community: {
    title: 'Your dialect matters. Join Dialect Library today.',
    description: 'Help preserve dialect voices while contributing to better AI language tools.',
  },
} as const;

type Campaign = keyof typeof campaigns;

interface ReferralCampaignPageProps {
  params: { code: string; campaign: string };
}

function isValidReferral(code: string, campaign: string): campaign is Campaign {
  return /^[A-Za-z0-9_-]{4,64}$/.test(code) && campaign in campaigns;
}

export async function generateMetadata({ params }: ReferralCampaignPageProps): Promise<Metadata> {
  if (!isValidReferral(params.code, params.campaign)) {
    return { title: 'Invitation not found', robots: { index: false, follow: false } };
  }

  const campaign = campaigns[params.campaign];
  const canonical = `/invite/${encodeURIComponent(params.code)}/${params.campaign}`;
  return {
    title: campaign.title,
    description: campaign.description,
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
      title: campaign.title,
      description: campaign.description,
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Dialect Library' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: campaign.title,
      description: campaign.description,
      images: ['/og-image.png'],
    },
  };
}

export default function ReferralCampaignPage({ params }: ReferralCampaignPageProps) {
  if (!isValidReferral(params.code, params.campaign)) notFound();
  return <ReferralInviteRedirect code={params.code} />;
}

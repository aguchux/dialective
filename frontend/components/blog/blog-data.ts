// Mock content only -- no backend/CMS wired up yet. Replace with a real
// data source (CMS, MDX, or an API endpoint) when the blog is implemented.
export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  author: string;
  publishedAt: string;
  readMinutes: number;
  tag: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'why-dialect-data-matters',
    title: 'Why dialect-level voice data matters for speech AI',
    excerpt:
      'Most speech models are trained on a handful of "standard" accents. Here is why that leaves hundreds of millions of speakers underserved.',
    body: [
      'Speech recognition and voice AI systems are only as good as the data they are trained on. Most publicly available datasets skew heavily toward a small number of widely spoken, well-resourced languages and their "standard" accents.',
      'For dialects and underrepresented languages, this creates a compounding gap: less data means worse models, worse models mean less usage, and less usage means even less data gets collected.',
      'Dialect Library exists to break that cycle by paying local speakers directly to contribute the voice and translation data their communities are missing from today\'s models.',
    ],
    author: 'Dialect Library Team',
    publishedAt: '2026-07-02',
    readMinutes: 4,
    tag: 'Product',
  },
  {
    slug: 'how-trainer-payouts-work',
    title: 'How trainer payouts will work',
    excerpt:
      'A look at the token wallet, quality scoring, and reward pool model we are building so trainers get paid fairly for their contributions.',
    body: [
      'Trainers fund their wallet, complete voice and translation tasks, and — once quality scoring is live — get paid from a pool funded by data subscribers.',
      'This post walks through the mechanics we are building: how tokens are priced, how submissions get scored, and how payouts will be calculated once the reward pool goes live.',
      'This is a placeholder post. The full breakdown will be published once scoring and payouts are live on the platform.',
    ],
    author: 'Dialect Library Team',
    publishedAt: '2026-07-18',
    readMinutes: 5,
    tag: 'Payouts',
  },
  {
    slug: 'onboarding-54-african-countries',
    title: 'Onboarding trainers across 54 African countries',
    excerpt:
      'Behind the scenes of building a country and dialect selection flow that scales across the whole continent, not just a handful of languages.',
    body: [
      'When we set out to build onboarding for Dialect Library, we didn\'t want to hardcode a short list of languages and call it done.',
      'Trainers now pick their country from the full list of African countries, then choose from that country\'s supported dialects — a structure designed to grow as coverage expands.',
      'This post is a placeholder covering the design decisions behind that flow. Full writeup coming soon.',
    ],
    author: 'Dialect Library Team',
    publishedAt: '2026-08-01',
    readMinutes: 3,
    tag: 'Engineering',
  },
];

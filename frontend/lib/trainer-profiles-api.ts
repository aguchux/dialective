import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

export interface PublicTrainerTestimony {
  id: string;
  kind: 'VIDEO' | 'TEXT';
  text: string | null;
  videoUrl: string | null;
  reviewedAt: string | null;
}

export interface PublicTrainerProfile {
  referralCode: string;
  firstName: string | null;
  lastInitial: string | null;
  memberSince: string;
  countryName: string | null;
  dialectName: string | null;
  dialectVariantName: string | null;
  identityVerified: boolean;
  scoredContributions: number;
  averageScore: number | null;
  testimonials: PublicTrainerTestimony[];
}

export async function getPublicTrainerProfile(
  referralCode: string,
): Promise<PublicTrainerProfile | null> {
  const response = await fetch(
    `${PUBLIC_API_V1_BASE_URL}/trainers/${encodeURIComponent(referralCode)}`,
    { next: { revalidate: 300 } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Unable to load trainer profile');
  return response.json();
}

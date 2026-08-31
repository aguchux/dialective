import { PUBLIC_API_V1_BASE_URL } from './public-api';

export interface PublicFaq {
  id: string;
  question: string;
  answer: string;
  updatedAt: string;
}

export async function getPublishedFaqs(): Promise<PublicFaq[]> {
  const response = await fetch(`${PUBLIC_API_V1_BASE_URL}/faqs`, {
    next: { revalidate: 60 },
  });
  if (!response.ok) throw new Error(`FAQ API returned ${response.status}`);
  return response.json() as Promise<PublicFaq[]>;
}

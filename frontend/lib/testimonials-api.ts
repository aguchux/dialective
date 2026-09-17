import type { LandingTestimonial } from '@/components/landing/TestimonialsCarousel';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

export interface PublicTestimonialsPage {
  items: LandingTestimonial[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PublicTestimonialSettings {
  testimonyEnabled: boolean;
  testimonyLandingLimit: number;
  testimonyBubblesEnabled: boolean;
  testimonyBubbleIntervalSeconds: number;
}

const EMPTY_PAGE: PublicTestimonialsPage = {
  items: [],
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
};

export async function getPublicTestimonialSettings(): Promise<PublicTestimonialSettings | null> {
  const response = await fetch(`${PUBLIC_API_V1_BASE_URL}/settings/public`, {
    next: { revalidate: 300 },
  });
  if (!response.ok) return null;
  return response.json();
}

export async function getPublicTestimonials(
  page = 1,
  pageSize = 12,
): Promise<PublicTestimonialsPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const response = await fetch(`${PUBLIC_API_V1_BASE_URL}/testimonials/public?${params}`, {
    next: { revalidate: 300 },
  });
  if (!response.ok) return EMPTY_PAGE;
  return response.json();
}

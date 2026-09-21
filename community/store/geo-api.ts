import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

export interface Country {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
}

/**
 * The DL Connect event hero, mirroring frontend/store/api.ts's
 * ConnectHeroSettings. The API resolves every fallback, so this is
 * render-ready as given.
 */
export interface ConnectHeroSettings {
  enabled: boolean;
  eventYear: string;
  title: string;
  subtitle: string | null;
  dateLabel: string | null;
  ctaLabel: string;
  url: string;
  imageUrl: string | null;
}

/** Only the slice of GET /settings/public this app actually renders. */
export interface PlatformPublicSettings {
  connectHero: ConnectHeroSettings;
}

/**
 * Separate slice (not folded into communityApi) since GET /geo/countries is
 * a public, unauthenticated, main-app endpoint outside the /community
 * prefix -- reused as-is here rather than duplicated, matching the "one
 * source of truth for countries" rule the rest of this repo already follows
 * (see frontend/store/api.ts's own getCountries usage).
 *
 * GET /settings/public is here for the same reason. Note communityApi's own
 * getPublicAdSettings hits /community/settings/public, which is a different
 * endpoint with a different shape -- these two must not be conflated.
 */
export const communityGeoApi = createApi({
  reducerPath: 'communityGeoApi',
  baseQuery: fetchBaseQuery({ baseUrl: PUBLIC_API_V1_BASE_URL }),
  endpoints: (builder) => ({
    listCountries: builder.query<Country[], void>({
      query: () => '/geo/countries',
    }),
    getPlatformPublicSettings: builder.query<PlatformPublicSettings, void>({
      query: () => '/settings/public',
    }),
  }),
});

export const { useListCountriesQuery, useGetPlatformPublicSettingsQuery } = communityGeoApi;

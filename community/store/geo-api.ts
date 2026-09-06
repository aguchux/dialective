import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

export interface Country {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
}

/**
 * Separate slice (not folded into communityApi) since GET /geo/countries is
 * a public, unauthenticated, main-app endpoint outside the /community
 * prefix -- reused as-is here rather than duplicated, matching the "one
 * source of truth for countries" rule the rest of this repo already follows
 * (see frontend/store/api.ts's own getCountries usage).
 */
export const communityGeoApi = createApi({
  reducerPath: 'communityGeoApi',
  baseQuery: fetchBaseQuery({ baseUrl: PUBLIC_API_V1_BASE_URL }),
  endpoints: (builder) => ({
    listCountries: builder.query<Country[], void>({
      query: () => '/geo/countries',
    }),
  }),
});

export const { useListCountriesQuery } = communityGeoApi;

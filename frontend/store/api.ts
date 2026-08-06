import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getSession } from 'next-auth/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

export interface PublicUser {
  id: string;
  email: string;
  role: 'TRAINER' | 'ADMIN';
  emailVerified: boolean;
  countryId: string | null;
  dialectId: string | null;
  dialectTag: string | null;
  onboardingComplete: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface Country {
  id: string;
  code: string;
  name: string;
}

export interface Dialect {
  id: string;
  tag: string;
  name: string;
}

export interface ApiErrorShape {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  path?: string;
  timestamp?: string;
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'data' in error) {
    const data = (error as { data?: ApiErrorShape }).data;
    if (Array.isArray(data?.message)) {
      return data.message.join(' ');
    }
    if (data?.message) {
      return data.message;
    }
  }
  return fallback;
}

export const dialectivaApi = createApi({
  reducerPath: 'dialectivaApi',
  baseQuery: fetchBaseQuery({
    baseUrl: PUBLIC_API_V1_BASE_URL,
    prepareHeaders: async (headers) => {
      headers.set('Content-Type', 'application/json');
      const session = await getSession();
      if (session?.accessToken) {
        headers.set('Authorization', `Bearer ${session.accessToken}`);
      }
      return headers;
    },
  }),
  tagTypes: ['Auth'],
  endpoints: (builder) => ({
    register: builder.mutation<AuthResult, { email: string; password: string }>({
      query: (body) => ({
        url: '/auth/register',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Auth'],
    }),
    getCountries: builder.query<Country[], void>({
      query: () => '/geo/countries',
    }),
    getDialects: builder.query<Dialect[], string>({
      query: (countryId) => `/geo/countries/${countryId}/dialects`,
    }),
    updateProfile: builder.mutation<PublicUser, { countryId: string; dialectId: string }>({
      query: (body) => ({
        url: '/auth/me',
        method: 'PATCH',
        body,
      }),
    }),
    requestMagicLink: builder.mutation<void, { email: string }>({
      query: (body) => ({
        url: '/auth/magic-link/request',
        method: 'POST',
        body,
      }),
    }),
    requestPasswordReset: builder.mutation<void, { email: string }>({
      query: (body) => ({
        url: '/auth/password-reset/request',
        method: 'POST',
        body,
      }),
    }),
    resetPassword: builder.mutation<void, { token: string; newPassword: string }>({
      query: (body) => ({
        url: '/auth/password-reset/confirm',
        method: 'POST',
        body,
      }),
    }),
    verifyEmail: builder.mutation<void, { token: string }>({
      query: (body) => ({
        url: '/auth/verify-email',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useRequestMagicLinkMutation,
  useRequestPasswordResetMutation,
  useResetPasswordMutation,
  useVerifyEmailMutation,
  useGetCountriesQuery,
  useGetDialectsQuery,
  useUpdateProfileMutation,
} = dialectivaApi;

export { normalizeErrorMessage };

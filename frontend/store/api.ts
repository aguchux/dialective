import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { getSession } from 'next-auth/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

export interface PublicUser {
  id: string;
  email: string;
  role: 'TRAINER' | 'ADMIN' | 'PARTNER';
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  emailVerified: boolean;
  countryId: string | null;
  dialectId: string | null;
  dialectTag: string | null;
  onboardingComplete: boolean;
  referralCode: string;
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

export interface DataAccessLeadInput {
  name: string;
  email: string;
  organization?: string;
  useCase?: string;
}

export interface ReferralProgram {
  id: string;
  name: string;
  commissionRate: string;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ReferralProgramInput {
  name: string;
  commissionRate?: number;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
}

export interface ReferralSummary {
  referrerEmail: string | null;
  referralCode: string | null;
  referredUsers: { id: string; email: string; createdAt: string }[];
  totalCommission: string;
  commissionCount: number;
}

export interface AdminStats {
  totalTrainers: number;
  activeReferralPrograms: number;
  pendingWithdrawals: number;
  dataAccessLeads: number;
  totalDepositsUsd: string;
  totalTokensFunded: string;
  totalReferralCommissions: string;
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
  tagTypes: ['Auth', 'ReferralPrograms', 'Users'],
  endpoints: (builder) => ({
    register: builder.mutation<AuthResult, { email: string; password: string; referralCode?: string }>({
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
    createDataAccessLead: builder.mutation<{ id: string; status: string }, DataAccessLeadInput>({
      query: (body) => ({
        url: '/leads/data-access',
        method: 'POST',
        body,
      }),
    }),
    getReferralPrograms: builder.query<ReferralProgram[], void>({
      query: () => '/admin/referral-programs',
      providesTags: ['ReferralPrograms'],
    }),
    createReferralProgram: builder.mutation<ReferralProgram, ReferralProgramInput>({
      query: (body) => ({
        url: '/admin/referral-programs',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['ReferralPrograms'],
    }),
    updateReferralProgram: builder.mutation<ReferralProgram, { id: string; body: Partial<ReferralProgramInput> }>({
      query: ({ id, body }) => ({
        url: `/admin/referral-programs/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['ReferralPrograms'],
    }),
    getReferrals: builder.query<ReferralSummary[], void>({
      query: () => '/admin/referrals',
    }),
    getAdminStats: builder.query<AdminStats, void>({
      query: () => '/admin/stats',
    }),
    getUsers: builder.query<PublicUser[], { role?: string; status?: string; search?: string } | void>({
      query: (params) => ({
        url: '/admin/users',
        params: params ?? undefined,
      }),
      providesTags: ['Users'],
    }),
    updateUserRole: builder.mutation<PublicUser, { id: string; role: string }>({
      query: ({ id, role }) => ({
        url: `/admin/users/${id}/role`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: ['Users'],
    }),
    updateUserStatus: builder.mutation<PublicUser, { id: string; status: string }>({
      query: ({ id, status }) => ({
        url: `/admin/users/${id}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['Users'],
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
  useCreateDataAccessLeadMutation,
  useGetReferralProgramsQuery,
  useCreateReferralProgramMutation,
  useUpdateReferralProgramMutation,
  useGetReferralsQuery,
  useGetAdminStatsQuery,
  useGetUsersQuery,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
} = dialectivaApi;

export { normalizeErrorMessage };

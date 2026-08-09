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

export interface AdminCountry {
  id: string;
  code: string;
  name: string;
  _count: { dialects: number; users: number };
}

export interface AdminDialect {
  id: string;
  tag: string;
  name: string;
  countryId: string;
  country: { id: string; name: string; code: string };
  _count: { users: number };
}

export interface CountryInput {
  code: string;
  name: string;
}

export interface DialectInput {
  tag: string;
  name: string;
  countryId: string;
}

export interface DataAccessLeadInput {
  name: string;
  email: string;
  organization?: string;
  useCase?: string;
}

export interface ReferralSettings {
  id: string;
  fundingBonusRate: string;
  fundingBonusEnabled: boolean;
  payoutBonusRate: string;
  payoutBonusEnabled: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface ReferralSettingsInput {
  fundingBonusRate?: number;
  fundingBonusEnabled?: boolean;
  payoutBonusRate?: number;
  payoutBonusEnabled?: boolean;
}

export interface ReferralSummary {
  referrerEmail: string | null;
  referralCode: string | null;
  referredUsers: { id: string; email: string; createdAt: string }[];
  totalCommission: string;
  bonusEventCount: number;
}

export interface Wallet {
  balance: string;
  tokenUsdRate: number;
}

export interface AdminStats {
  totalTrainers: number;
  referralSettings: {
    fundingBonusRate: string;
    fundingBonusEnabled: boolean;
    payoutBonusRate: string;
    payoutBonusEnabled: boolean;
  };
  pendingWithdrawals: number;
  dataAccessLeads: number;
  totalDepositsUsd: string;
  totalTokensFunded: string;
  totalReferralBonuses: string;
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
  tagTypes: ['Auth', 'ReferralSettings', 'Users', 'AdminCountries', 'AdminDialects'],
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
    getWallet: builder.query<Wallet, void>({
      query: () => '/wallet',
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
    getReferralSettings: builder.query<ReferralSettings, void>({
      query: () => '/admin/referral-settings',
      providesTags: ['ReferralSettings'],
    }),
    updateReferralSettings: builder.mutation<ReferralSettings, ReferralSettingsInput>({
      query: (body) => ({
        url: '/admin/referral-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['ReferralSettings'],
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
    getAdminCountries: builder.query<AdminCountry[], void>({
      query: () => '/geo/admin/countries',
      providesTags: ['AdminCountries'],
    }),
    createCountry: builder.mutation<AdminCountry, CountryInput>({
      query: (body) => ({ url: '/geo/admin/countries', method: 'POST', body }),
      invalidatesTags: ['AdminCountries'],
    }),
    updateCountry: builder.mutation<AdminCountry, { id: string; body: Partial<CountryInput> }>({
      query: ({ id, body }) => ({ url: `/geo/admin/countries/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminCountries', 'AdminDialects'],
    }),
    deleteCountry: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/geo/admin/countries/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminCountries'],
    }),
    getAdminDialects: builder.query<AdminDialect[], void>({
      query: () => '/geo/admin/dialects',
      providesTags: ['AdminDialects'],
    }),
    createDialect: builder.mutation<AdminDialect, DialectInput>({
      query: (body) => ({ url: '/geo/admin/dialects', method: 'POST', body }),
      invalidatesTags: ['AdminDialects', 'AdminCountries'],
    }),
    updateDialect: builder.mutation<AdminDialect, { id: string; body: Partial<DialectInput> }>({
      query: ({ id, body }) => ({ url: `/geo/admin/dialects/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminDialects', 'AdminCountries'],
    }),
    deleteDialect: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/geo/admin/dialects/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminDialects', 'AdminCountries'],
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
  useGetWalletQuery,
  useUpdateProfileMutation,
  useCreateDataAccessLeadMutation,
  useGetReferralSettingsQuery,
  useUpdateReferralSettingsMutation,
  useGetReferralsQuery,
  useGetAdminStatsQuery,
  useGetUsersQuery,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
  useGetAdminCountriesQuery,
  useCreateCountryMutation,
  useUpdateCountryMutation,
  useDeleteCountryMutation,
  useGetAdminDialectsQuery,
  useCreateDialectMutation,
  useUpdateDialectMutation,
  useDeleteDialectMutation,
} = dialectivaApi;

export { normalizeErrorMessage };

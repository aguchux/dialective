import { dialectivaApi } from './api';

export type DykSettings = { enabled: boolean; intervalMinutes: number; maxDisplays: number };
export const DYK_CONDITIONS = [
  { key: 'CLICKED', label: 'Clicked the action button' },
  { key: 'VISITED', label: 'Visited the link (tracked)' },
  { key: 'PHONE', label: 'Phone verified' },
  { key: 'KYC', label: 'Identity approved' },
  { key: 'PWA', label: 'Web app installed' },
  { key: 'REFERRAL_SHARE', label: 'Referral ad shared' },
  { key: 'TRAINING', label: 'First recording submitted' },
  { key: 'COURSE', label: 'Course completed' },
  { key: 'TESTIMONY', label: 'Testimony submitted' },
  { key: 'QRAC', label: 'QRAC signed' },
] as const;
export type DykNotice = {
  id: string;
  content: string;
  imageKey: string;
  imageBucket: string;
  imageUrl: string;
  href: string;
  ctaLabel: string;
  stopConditions: string[];
  targetId?: string | null;
  active: boolean;
  sortOrder: number;
};
export type DykDraft = Omit<DykNotice, 'id' | 'imageUrl'>;
const api = dialectivaApi.enhanceEndpoints({ addTagTypes: ['Dyk'] }).injectEndpoints({
  endpoints: (b) => ({
    dykSettings: b.query<DykSettings, void>({
      query: () => '/admin/dyk/settings',
      providesTags: ['Dyk'],
    }),
    saveDykSettings: b.mutation<DykSettings, DykSettings>({
      query: (body) => ({ url: '/admin/dyk/settings', method: 'PUT', body }),
      invalidatesTags: ['Dyk'],
    }),
    adminDyk: b.query<DykNotice[], void>({ query: () => '/admin/dyk', providesTags: ['Dyk'] }),
    saveDyk: b.mutation<DykNotice, { id?: string; body: DykDraft }>({
      query: ({ id, body }) => ({
        url: `/admin/dyk${id ? `/${id}` : ''}`,
        method: id ? 'PUT' : 'POST',
        body,
      }),
      invalidatesTags: ['Dyk'],
    }),
    deleteDyk: b.mutation<unknown, string>({
      query: (id) => ({ url: `/admin/dyk/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Dyk'],
    }),
    uploadDyk: b.mutation<{ uploadUrl: string; key: string; bucket: string }, string>({
      query: (contentType) => ({
        url: '/admin/dyk/upload-url',
        method: 'POST',
        body: { contentType },
      }),
    }),
    dykFeed: b.query<{ items: DykNotice[]; nextAt: string | null }, void>({ query: () => '/dyk' }),
    dykImpression: b.mutation<{ allowed: boolean }, { id: string; navigation?: boolean }>({
      query: ({ id, navigation }) => ({
        url: `/dyk/${id}/impression`,
        method: 'POST',
        body: { navigation },
      }),
    }),
    clickDyk: b.mutation<{ href: string }, string>({
      query: (id) => ({ url: `/dyk/${id}/click`, method: 'POST' }),
    }),
    visitDyk: b.mutation<{ recorded: boolean }, { id: string; href: string }>({
      query: ({ id, href }) => ({ url: `/dyk/${id}/visit`, method: 'POST', body: { href } }),
    }),
  }),
});
export const {
  useDykSettingsQuery,
  useSaveDykSettingsMutation,
  useAdminDykQuery,
  useSaveDykMutation,
  useDeleteDykMutation,
  useUploadDykMutation,
  useLazyDykFeedQuery,
  useDykImpressionMutation,
  useClickDykMutation,
  useVisitDykMutation,
} = api;

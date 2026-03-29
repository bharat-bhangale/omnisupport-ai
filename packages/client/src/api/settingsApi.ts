import { omnisupportApi } from './omnisupportApi';

// Types
export interface CompanyProfile {
  id: string;
  name: string;
  slug: string;
  industry?: string;
  timezone: string;
  primaryLanguage: string;
  logoUrl?: string;
  tier: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'agent' | 'manager' | 'admin';
  status: 'active' | 'pending';
  lastActive?: string;
  createdAt: string;
}

export interface UsageInfo {
  used: number;
  limit: number;
}

export interface PaymentMethod {
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: string;
  pdfUrl?: string;
}

export interface BillingInfo {
  plan: string;
  status: string;
  nextChargeDate?: string;
  nextChargeAmount?: number;
  cancelAtPeriodEnd: boolean;
  usage: {
    minutes: UsageInfo;
    tickets: UsageInfo;
  };
  paymentMethod: PaymentMethod | null;
  invoices: Invoice[];
}

export interface ApiKeysInfo {
  publicKey: string | null;
  secretKey: string | null;
  webhookSecret: string | null;
  lastRotatedAt?: string;
}

export interface SecuritySettings {
  twoFactorRequired: boolean;
  sessionTimeoutMinutes: number;
  dataRetentionDays: number;
}

export interface UpdateCompanyPayload {
  name?: string;
  industry?: string;
  timezone?: string;
  primaryLanguage?: string;
}

export interface InviteUserPayload {
  email: string;
  role: 'agent' | 'manager' | 'admin';
}

export interface UpdateRolePayload {
  role: 'agent' | 'manager' | 'admin';
}

export interface UpdateSecurityPayload {
  twoFactorRequired?: boolean;
  sessionTimeoutMinutes?: number;
  dataRetentionDays?: number;
}

export const settingsApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    // Company
    getCompanyProfile: builder.query<{ company: CompanyProfile }, void>({
      query: () => '/settings/company',
      providesTags: ['Company' as const],
    }),

    updateCompanyProfile: builder.mutation<{ company: CompanyProfile }, UpdateCompanyPayload>({
      query: (payload) => ({
        url: '/settings/company',
        method: 'PUT',
        body: payload,
      }),
      invalidatesTags: ['Company' as const],
    }),

    uploadCompanyLogo: builder.mutation<{ logoUrl: string }, FormData>({
      query: (formData) => ({
        url: '/settings/company/logo',
        method: 'POST',
        body: formData,
        formData: true,
      }),
      invalidatesTags: ['Company' as const],
    }),

    // Team
    getTeamMembers: builder.query<{ members: TeamMember[]; total: number }, void>({
      query: () => '/settings/team',
      providesTags: ['Team' as const],
    }),

    inviteTeamMember: builder.mutation<{ user: TeamMember }, InviteUserPayload>({
      query: (payload) => ({
        url: '/settings/team/invite',
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: ['Team' as const],
    }),

    updateMemberRole: builder.mutation<void, { userId: string; role: string }>({
      query: ({ userId, role }) => ({
        url: `/settings/team/${userId}/role`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: ['Team' as const],
    }),

    removeTeamMember: builder.mutation<void, string>({
      query: (userId) => ({
        url: `/settings/team/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Team' as const],
    }),

    // Billing
    getBillingInfo: builder.query<{ billing: BillingInfo }, void>({
      query: () => '/settings/billing',
      providesTags: ['Billing' as const],
    }),

    createBillingPortal: builder.mutation<{ url: string }, void>({
      query: () => ({
        url: '/settings/billing/create-portal',
        method: 'POST',
      }),
    }),

    // API Keys
    getApiKeys: builder.query<{ apiKeys: ApiKeysInfo }, void>({
      query: () => '/settings/api-keys',
      providesTags: ['ApiKeys' as const],
    }),

    regenerateApiKeys: builder.mutation<{ apiKeys: ApiKeysInfo & { secretKey: string } }, void>({
      query: () => ({
        url: '/settings/api-keys/regenerate',
        method: 'POST',
      }),
      invalidatesTags: ['ApiKeys' as const],
    }),

    // Security
    updateSecurity: builder.mutation<{ security: SecuritySettings }, UpdateSecurityPayload>({
      query: (payload) => ({
        url: '/settings/security',
        method: 'PUT',
        body: payload,
      }),
    }),

    // Data Export
    requestDataExport: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/settings/export-data',
        method: 'POST',
      }),
    }),
  }),
});

export const {
  useGetCompanyProfileQuery,
  useUpdateCompanyProfileMutation,
  useUploadCompanyLogoMutation,
  useGetTeamMembersQuery,
  useInviteTeamMemberMutation,
  useUpdateMemberRoleMutation,
  useRemoveTeamMemberMutation,
  useGetBillingInfoQuery,
  useCreateBillingPortalMutation,
  useGetApiKeysQuery,
  useRegenerateApiKeysMutation,
  useUpdateSecurityMutation,
  useRequestDataExportMutation,
} = settingsApi;

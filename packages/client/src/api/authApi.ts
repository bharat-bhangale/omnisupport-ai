import { omnisupportApi } from './omnisupportApi';

// Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignUpRequest {
  name: string;
  email: string;
  password: string;
  companyName: string;
  companySize?: string;
  industry?: string;
}

export interface VerifyMfaRequest {
  email: string;
  code: string;
  mfaToken: string;
}

export interface ResendMfaCodeRequest {
  email: string;
  mfaToken: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName?: string;
  role: string;
  onboardingComplete?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
  mfaRequired?: boolean;
  mfaToken?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  name?: string;
  email?: string;
  avatar?: string;
}

export const authApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Login with email and password
     */
    login: builder.mutation<AuthResponse, LoginRequest>({
      query: (body) => ({
        url: '/auth/login',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Register a new user and company
     */
    signUp: builder.mutation<AuthResponse, SignUpRequest>({
      query: (body) => ({
        url: '/auth/signup',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Verify MFA code
     */
    verifyMfa: builder.mutation<AuthResponse, VerifyMfaRequest>({
      query: (body) => ({
        url: '/auth/mfa/verify',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Resend MFA code
     */
    resendMfaCode: builder.mutation<{ success: boolean }, ResendMfaCodeRequest>({
      query: (body) => ({
        url: '/auth/mfa/resend',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Refresh access token
     */
    refreshToken: builder.mutation<AuthResponse, RefreshTokenRequest>({
      query: (body) => ({
        url: '/auth/refresh',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Logout (invalidate refresh token)
     */
    logout: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
    }),

    /**
     * Request password reset email
     */
    forgotPassword: builder.mutation<{ success: boolean }, ForgotPasswordRequest>({
      query: (body) => ({
        url: '/auth/forgot-password',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Reset password with token
     */
    resetPassword: builder.mutation<{ success: boolean }, ResetPasswordRequest>({
      query: (body) => ({
        url: '/auth/reset-password',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Change password (authenticated)
     */
    changePassword: builder.mutation<{ success: boolean }, ChangePasswordRequest>({
      query: (body) => ({
        url: '/auth/change-password',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Get current user profile
     */
    getCurrentUser: builder.query<AuthUser, void>({
      query: () => '/auth/me',
    }),

    /**
     * Update user profile
     */
    updateProfile: builder.mutation<AuthUser, UpdateProfileRequest>({
      query: (body) => ({
        url: '/auth/profile',
        method: 'PATCH',
        body,
      }),
    }),

    /**
     * Enable MFA
     */
    enableMfa: builder.mutation<{ qrCode: string; secret: string }, void>({
      query: () => ({
        url: '/auth/mfa/enable',
        method: 'POST',
      }),
    }),

    /**
     * Confirm MFA setup
     */
    confirmMfa: builder.mutation<{ success: boolean }, { code: string }>({
      query: (body) => ({
        url: '/auth/mfa/confirm',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Disable MFA
     */
    disableMfa: builder.mutation<{ success: boolean }, { password: string }>({
      query: (body) => ({
        url: '/auth/mfa/disable',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Verify email
     */
    verifyEmail: builder.mutation<{ success: boolean }, { token: string }>({
      query: (body) => ({
        url: '/auth/verify-email',
        method: 'POST',
        body,
      }),
    }),

    /**
     * Resend verification email
     */
    resendVerificationEmail: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        url: '/auth/resend-verification',
        method: 'POST',
      }),
    }),
  }),
});

export const {
  useLoginMutation,
  useSignUpMutation,
  useVerifyMfaMutation,
  useResendMfaCodeMutation,
  useRefreshTokenMutation,
  useLogoutMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useChangePasswordMutation,
  useGetCurrentUserQuery,
  useUpdateProfileMutation,
  useEnableMfaMutation,
  useConfirmMfaMutation,
  useDisableMfaMutation,
  useVerifyEmailMutation,
  useResendVerificationEmailMutation,
} = authApi;

import {
  createApi,
  fetchBaseQuery,
  retry,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';

const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

const setAuthToken = (token: string): void => {
  localStorage.setItem('auth_token', token);
};

const clearAuthToken = (): void => {
  localStorage.removeItem('auth_token');
};

// Base query with authentication
const baseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000, // 30 second timeout
  prepareHeaders: (headers) => {
    const token = getAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers.set('Content-Type', 'application/json');
    return headers;
  },
});

// Enhanced base query with error handling and retry logic
const baseQueryWithErrorHandling: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions);

  // Handle 401 Unauthorized - attempt token refresh
  if (result.error && result.error.status === 401) {
    // Try to refresh the token
    const refreshResult = await baseQuery(
      { url: '/auth/refresh', method: 'POST' },
      api,
      extraOptions
    );

    if (refreshResult.data) {
      const data = refreshResult.data as { token: string };
      setAuthToken(data.token);
      // Retry original request with new token
      result = await baseQuery(args, api, extraOptions);
    } else {
      // Refresh failed - clear token and redirect to login
      clearAuthToken();
      window.location.href = '/login?session=expired';
    }
  }

  // Handle specific error codes
  if (result.error) {
    const status = result.error.status;
    const data = result.error.data as { message?: string; code?: string } | undefined;

    // Log errors for debugging (in non-production)
    if (import.meta.env.DEV) {
      console.error('[API Error]', {
        status,
        endpoint: typeof args === 'string' ? args : args.url,
        message: data?.message,
        code: data?.code,
      });
    }

    // Handle 403 Forbidden - insufficient permissions
    if (status === 403) {
      // Optionally dispatch an action to show permission denied UI
      console.warn('Permission denied:', data?.message);
    }

    // Handle 404 Not Found
    if (status === 404) {
      console.warn('Resource not found:', typeof args === 'string' ? args : args.url);
    }

    // Handle 429 Rate Limited
    if (status === 429) {
      console.warn('Rate limited - too many requests');
    }

    // Handle 500+ Server Errors
    if (typeof status === 'number' && status >= 500) {
      console.error('Server error:', data?.message || 'Unknown server error');
    }
  }

  return result;
};

// Add retry logic for transient failures (network issues, 5xx errors)
const baseQueryWithRetry = retry(baseQueryWithErrorHandling, {
  maxRetries: 3,
  // Only retry on network errors or 5xx status codes
  backoff: (attempt, maxRetries) => {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    return new Promise((resolve) => setTimeout(resolve, delay));
  },
});

// Custom error handler that decides what to retry
const baseQueryWithSmartRetry: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await baseQueryWithErrorHandling(args, api, extraOptions);

  // Don't retry client errors (4xx except 408 Request Timeout, 429 Rate Limit)
  if (result.error) {
    const status = result.error.status;
    if (
      typeof status === 'number' &&
      status >= 400 &&
      status < 500 &&
      status !== 408 &&
      status !== 429
    ) {
      // Bail out of retry for client errors
      (result as any).meta = { ...((result as any).meta || {}), bailout: true };
    }
  }

  return result;
};

export const omnisupportApi = createApi({
  reducerPath: 'omnisupportApi',
  baseQuery: baseQueryWithSmartRetry,
  tagTypes: [
    'Customer',
    'Customers',
    'AtRiskCustomers',
    'Ticket',
    'Tickets',
    'Call',
    'Calls',
    'Analytics',
    'KnowledgeBase',
    'Workflow',
    'SLA',
    'AgentConfig',
    'Company',
    'Team',
    'Billing',
    'ApiKeys',
    'Escalation',
    'Integration',
    'QAReport',
    'QARubric',
  ],
  endpoints: () => ({}),
});

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

export const omnisupportApi = createApi({
  reducerPath: 'omnisupportApi',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL || '/api',
    prepareHeaders: (headers) => {
      const token = getAuthToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      headers.set('Content-Type', 'application/json');
      return headers;
    },
  }),
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
  ],
  endpoints: () => ({}),
});

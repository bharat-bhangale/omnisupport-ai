// ============================================================================
// LANGUAGES RTK QUERY API
// ============================================================================

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// ============================================================================
// TYPES
// ============================================================================

export interface SupportedLanguage {
  code: string;
  name: string;
  flag: string;
}

export interface KBCoverage {
  code: string;
  name: string;
  flag: string;
  documentCount: number;
  hasContent: boolean;
}

export interface LanguageDetectionResult {
  languageCode: string;
  languageName: string;
  flag: string;
  confidence: number;
  isSupported: boolean;
}

export interface CompanyLanguageConfig {
  primaryLanguage: string;
  supportedLanguages: string[];
  autoDetect: boolean;
}

// ============================================================================
// LANGUAGE CONSTANTS (mirror backend)
// ============================================================================

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  pt: 'Portuguese',
  ru: 'Russian',
  it: 'Italian',
  nl: 'Dutch',
  ko: 'Korean',
  tr: 'Turkish',
  pl: 'Polish',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  ms: 'Malay',
  ta: 'Tamil',
  te: 'Telugu',
  bn: 'Bengali',
  ur: 'Urdu',
};

export const LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇺🇸',
  hi: '🇮🇳',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
  ar: '🇸🇦',
  zh: '🇨🇳',
  ja: '🇯🇵',
  pt: '🇧🇷',
  ru: '🇷🇺',
  it: '🇮🇹',
  nl: '🇳🇱',
  ko: '🇰🇷',
  tr: '🇹🇷',
  pl: '🇵🇱',
  vi: '🇻🇳',
  th: '🇹🇭',
  id: '🇮🇩',
  ms: '🇲🇾',
  ta: '🇮🇳',
  te: '🇮🇳',
  bn: '🇧🇩',
  ur: '🇵🇰',
};

// Language category for coloring
export const LANGUAGE_CATEGORY: Record<string, 'english' | 'indian' | 'european' | 'asian' | 'other'> = {
  en: 'english',
  hi: 'indian',
  ta: 'indian',
  te: 'indian',
  bn: 'indian',
  ur: 'indian',
  es: 'european',
  fr: 'european',
  de: 'european',
  it: 'european',
  nl: 'european',
  pl: 'european',
  pt: 'european',
  ru: 'european',
  tr: 'european',
  zh: 'asian',
  ja: 'asian',
  ko: 'asian',
  vi: 'asian',
  th: 'asian',
  id: 'asian',
  ms: 'asian',
  ar: 'other',
};

export function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES[code] || 'Unknown';
}

export function getLanguageFlag(code: string): string {
  return LANGUAGE_FLAGS[code] || '🌐';
}

// ============================================================================
// API SLICE
// ============================================================================

export const languagesApi = createApi({
  reducerPath: 'languagesApi',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['LanguageConfig', 'KBCoverage'],
  endpoints: (builder) => ({
    // ========================================================================
    // GET /languages/supported — List all supported languages
    // ========================================================================
    getSupportedLanguages: builder.query<
      { languages: SupportedLanguage[]; count: number },
      void
    >({
      query: () => '/languages/supported',
    }),

    // ========================================================================
    // GET /languages/kb-coverage — KB document count per language
    // ========================================================================
    getKBCoverage: builder.query<
      { coverage: KBCoverage[]; totalLanguages: number },
      void
    >({
      query: () => '/languages/kb-coverage',
      providesTags: ['KBCoverage'],
    }),

    // ========================================================================
    // POST /languages/detect — Detect language from text
    // ========================================================================
    detectLanguage: builder.mutation<LanguageDetectionResult, string>({
      query: (text) => ({
        url: '/languages/detect',
        method: 'POST',
        body: { text },
      }),
    }),

    // ========================================================================
    // GET /languages/company-config — Get company's language settings
    // ========================================================================
    getLanguageConfig: builder.query<CompanyLanguageConfig, void>({
      query: () => '/languages/company-config',
      providesTags: ['LanguageConfig'],
    }),

    // ========================================================================
    // PATCH /languages/company-config — Update company's language settings
    // ========================================================================
    updateLanguageConfig: builder.mutation<
      CompanyLanguageConfig,
      Partial<CompanyLanguageConfig>
    >({
      query: (data) => ({
        url: '/languages/company-config',
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['LanguageConfig'],
    }),
  }),
});

// ============================================================================
// EXPORTS
// ============================================================================

export const {
  useGetSupportedLanguagesQuery,
  useGetKBCoverageQuery,
  useDetectLanguageMutation,
  useGetLanguageConfigQuery,
  useUpdateLanguageConfigMutation,
} = languagesApi;

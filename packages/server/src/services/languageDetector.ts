// ============================================================================
// LANGUAGE DETECTOR SERVICE
// ============================================================================
// Detects language from text using GPT-4o with Redis caching

import OpenAI from 'openai';
import crypto from 'crypto';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ============================================================================
// SUPPORTED LANGUAGES
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

// Language flag emojis for UI display
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

// ============================================================================
// OPENAI CLIENT
// ============================================================================

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ============================================================================
// LANGUAGE DETECTOR
// ============================================================================

export const languageDetector = {
  /**
   * Get full language name from ISO 639-1 code
   */
  getLanguageName(code: string): string {
    return SUPPORTED_LANGUAGES[code.toLowerCase()] || 'English';
  },

  /**
   * Get flag emoji for language code
   */
  getLanguageFlag(code: string): string {
    return LANGUAGE_FLAGS[code.toLowerCase()] || '🌐';
  },

  /**
   * Check if language code is supported
   */
  isSupported(code: string): boolean {
    return code.toLowerCase() in SUPPORTED_LANGUAGES;
  },

  /**
   * Get all supported languages as array
   */
  getSupportedLanguages(): Array<{ code: string; name: string; flag: string }> {
    return Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
      code,
      name,
      flag: LANGUAGE_FLAGS[code] || '🌐',
    }));
  },

  /**
   * Detect language from text using GPT-4o
   * Returns ISO 639-1 language code
   */
  async detectLanguageFromText(
    text: string,
    companyId?: string
  ): Promise<{ code: string; name: string; confidence: number }> {
    if (!text || text.trim().length === 0) {
      return { code: 'en', name: 'English', confidence: 0 };
    }

    // Use first 200 chars for detection
    const sample = text.slice(0, 200).trim();

    // Generate cache key using hash of text sample
    const hash = crypto.createHash('md5').update(sample.slice(0, 50)).digest('hex');
    const cacheKey = companyId ? `${companyId}:lang:${hash}` : `lang:${hash}`;

    try {
      // Check cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed;
      }

      // GPT-4o language detection
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 10,
        messages: [
          {
            role: 'system',
            content: `Identify the language of the text. Return ONLY the ISO 639-1 code.
Examples: en, hi, es, fr, de, ar, zh, ja, pt, ru, it, nl, ko, tr, pl, vi, th, id, ms, ta, te, bn, ur
If unsure, return 'en'.`,
          },
          {
            role: 'user',
            content: sample,
          },
        ],
      });

      const rawCode = response.choices[0]?.message?.content?.trim().toLowerCase() || 'en';

      // Extract just the language code (handle potential extra text)
      const code = rawCode.match(/^[a-z]{2}/)?.[0] || 'en';

      // Validate against supported languages
      const validCode = this.isSupported(code) ? code : 'en';
      const name = this.getLanguageName(validCode);

      // Estimate confidence based on text length and response
      const confidence = sample.length > 50 ? 0.95 : sample.length > 20 ? 0.85 : 0.7;

      const result = { code: validCode, name, confidence };

      // Cache result for 1 hour
      await redis.setex(cacheKey, 3600, JSON.stringify(result));

      return result;
    } catch (error) {
      logger.error({ error, textLength: text.length }, 'Language detection failed');
      return { code: 'en', name: 'English', confidence: 0 };
    }
  },

  /**
   * Detect language from Deepgram transcript metadata
   * Used in voice channel when Deepgram returns detected_language
   */
  parseDeepgramLanguage(metadata: Record<string, unknown>): string | null {
    const detected = metadata?.detected_language as string | undefined;
    if (!detected) return null;

    // Deepgram returns codes like 'en-US', 'hi', 'es-419'
    const code = detected.split('-')[0].toLowerCase();
    return this.isSupported(code) ? code : null;
  },

  /**
   * Build language instruction for system prompt
   */
  buildLanguageInstruction(languageCode: string): string {
    const languageName = this.getLanguageName(languageCode);

    if (languageCode === 'en') {
      return 'Respond in English.';
    }

    return `Respond ONLY in ${languageName}. If the customer switches to a different language, match their language.`;
  },

  /**
   * Get Pinecone namespace for language
   */
  getLanguageNamespace(companyId: string, languageCode: string): string {
    return `${companyId}:${languageCode}`;
  },
};

export default languageDetector;

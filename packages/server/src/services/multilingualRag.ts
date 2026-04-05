// ============================================================================
// MULTILINGUAL RAG SERVICE
// ============================================================================
// Cross-language knowledge base search with fallback to primary language

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { languageDetector } from './languageDetector.js';

// ============================================================================
// CLIENTS
// ============================================================================

const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ============================================================================
// TYPES
// ============================================================================

interface KBSearchResult {
  id: string;
  score: number;
  content: string;
  title?: string;
  source?: string;
  language: string;
  metadata?: Record<string, unknown>;
}

interface MultilingualSearchOptions {
  query: string;
  companyId: string;
  detectedLang: string;
  primaryLang?: string;
  topK?: number;
  minScore?: number;
}

const childLogger = logger.child({ service: 'multilingualRag' });

// ============================================================================
// EMBEDDING HELPER
// ============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    childLogger.error({ error, textLength: text.length }, 'Failed to generate embedding');
    throw error;
  }
}

// ============================================================================
// MULTILINGUAL RAG SERVICE
// ============================================================================

export const multilingualRag = {
  /**
   * Search KB with multilingual support
   * First searches detected language namespace, then falls back to primary/English
   */
  async searchKBMultilingual(options: MultilingualSearchOptions): Promise<KBSearchResult[]> {
    const {
      query,
      companyId,
      detectedLang,
      primaryLang = 'en',
      topK = 5,
      minScore = 0.7,
    } = options;

    const index = pinecone.Index(env.PINECONE_INDEX);
    const results: KBSearchResult[] = [];
    const seenIds = new Set<string>();

    try {
      // Generate query embedding once
      const queryEmbedding = await generateEmbedding(query);

      // Step 1: Search in detected language namespace
      const detectedNamespace = languageDetector.getLanguageNamespace(companyId, detectedLang);

      try {
        const langResults = await index.namespace(detectedNamespace).query({
          vector: queryEmbedding,
          topK: Math.min(topK, 3),
          includeMetadata: true,
        });

        for (const match of langResults.matches || []) {
          if (match.score && match.score >= minScore) {
            seenIds.add(match.id);
            results.push({
              id: match.id,
              score: match.score,
              content: (match.metadata?.content as string) || '',
              title: match.metadata?.title as string | undefined,
              source: match.metadata?.source as string | undefined,
              language: detectedLang,
              metadata: match.metadata as Record<string, unknown>,
            });
          }
        }
      } catch (err) {
        logger.warn({ namespace: detectedNamespace, error: err }, 'Language namespace search failed');
      }

      // Step 2: If we don't have enough results, search primary/English namespace
      const needMore = results.length < 3;
      const shouldSearchFallback =
        needMore && detectedLang !== primaryLang && detectedLang !== 'en';

      if (shouldSearchFallback) {
        // Search primary language first, then English if different
        const fallbackLangs = [primaryLang];
        if (primaryLang !== 'en') {
          fallbackLangs.push('en');
        }

        for (const fallbackLang of fallbackLangs) {
          if (results.length >= topK) break;

          const fallbackNamespace = languageDetector.getLanguageNamespace(companyId, fallbackLang);
          const remaining = topK - results.length;

          try {
            const fallbackResults = await index.namespace(fallbackNamespace).query({
              vector: queryEmbedding,
              topK: remaining,
              includeMetadata: true,
            });

            for (const match of fallbackResults.matches || []) {
              if (seenIds.has(match.id)) continue;
              if (match.score && match.score >= minScore * 0.9) {
                // Slightly lower threshold for fallback
                seenIds.add(match.id);
                results.push({
                  id: match.id,
                  score: match.score * 0.95, // Slight penalty for non-native language
                  content: (match.metadata?.content as string) || '',
                  title: match.metadata?.title as string | undefined,
                  source: match.metadata?.source as string | undefined,
                  language: fallbackLang,
                  metadata: match.metadata as Record<string, unknown>,
                });
              }
            }
          } catch (err) {
            logger.warn({ namespace: fallbackNamespace, error: err }, 'Fallback namespace search failed');
          }
        }
      }

      // Sort by score and return top results
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, topK);
    } catch (error) {
      logger.error({ error, query, companyId }, 'Multilingual KB search failed');
      return [];
    }
  },

  /**
   * Format search results for system prompt context
   */
  formatResultsForPrompt(results: KBSearchResult[], targetLanguage: string): string {
    if (results.length === 0) {
      return '';
    }

    const formattedResults = results.map((r, idx) => {
      const langNote = r.language !== targetLanguage ? ` (from ${languageDetector.getLanguageName(r.language)} KB)` : '';
      const title = r.title ? `**${r.title}**${langNote}\n` : '';
      return `[${idx + 1}] ${title}${r.content}`;
    });

    return `\n\n[KNOWLEDGE BASE CONTEXT]\n${formattedResults.join('\n\n')}`;
  },

  /**
   * Index document in language-specific namespace
   */
  async indexDocument(
    companyId: string,
    language: string,
    documentId: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      const index = pinecone.Index(env.PINECONE_INDEX);
      const namespace = languageDetector.getLanguageNamespace(companyId, language);

      const embedding = await generateEmbedding(content);

      await index.namespace(namespace).upsert([
        {
          id: documentId,
          values: embedding,
          metadata: {
            ...metadata,
            content,
            language,
            companyId,
            indexedAt: new Date().toISOString(),
          },
        },
      ]);

      childLogger.info({ documentId, language, namespace }, 'Document indexed in language namespace');
    } catch (error) {
      childLogger.error({ error, documentId, language, companyId }, 'Failed to index document');
      throw error;
    }
  },

  /**
   * Delete document from language namespace
   */
  async deleteDocument(companyId: string, language: string, documentId: string): Promise<void> {
    try {
      const index = pinecone.Index(env.PINECONE_INDEX);
      const namespace = languageDetector.getLanguageNamespace(companyId, language);

      await index.namespace(namespace).deleteOne(documentId);
      childLogger.info({ documentId, language }, 'Document deleted from language namespace');
    } catch (error) {
      childLogger.error({ error, documentId, language, companyId }, 'Failed to delete document');
      throw error;
    }
  },

  /**
   * Get namespace stats for a language
   */
  async getNamespaceStats(
    companyId: string,
    language: string
  ): Promise<{ vectorCount: number; exists: boolean }> {
    try {
      const index = pinecone.Index(env.PINECONE_INDEX);
      const namespace = languageDetector.getLanguageNamespace(companyId, language);
      const stats = await index.namespace(namespace).describeIndexStats();
      const vectorCount = stats.namespaces?.[namespace]?.recordCount || 0;

      return { vectorCount, exists: vectorCount > 0 };
    } catch {
      return { vectorCount: 0, exists: false };
    }
  },
};

export default multilingualRag;

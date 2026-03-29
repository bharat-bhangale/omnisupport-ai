import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { OPENAI_CONFIG, PINECONE_CONFIG } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { KBGap } from '../models/KBDocument.js';
import { emitKBGap } from '../sockets/activitySocket.js';
import type { Channel } from '../config/constants.js';

const childLogger = logger.child({ service: 'rag' });

// Initialize clients
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
const pineconeIndex = pinecone.index(env.PINECONE_INDEX);

/**
 * KB Search Result interface
 */
export interface KBSearchResult {
  answer: string;
  confidence: number;
  sources: string[];
}

/**
 * Search parameters
 */
export interface KBSearchParams {
  query: string;
  companyId: string;
  language?: string;
  channel: Channel;
  topK?: number;
}

/**
 * Pinecone match result
 */
interface PineconeMatch {
  id: string;
  score?: number;
  metadata?: {
    documentId?: string;
    title?: string;
    category?: string;
    chunk_index?: number;
    text?: string;
    [key: string]: unknown;
  };
}

/**
 * Generate embedding for text using OpenAI
 */
export async function embedQuery(text: string): Promise<number[]> {
  const startTime = Date.now();
  
  try {
    const response = await openai.embeddings.create({
      model: OPENAI_CONFIG.EMBEDDING_MODEL,
      input: text.slice(0, 8000), // Max input length
    });
    
    childLogger.debug(
      { textLength: text.length, durationMs: Date.now() - startTime },
      'Generated embedding'
    );
    
    return response.data[0].embedding;
  } catch (error) {
    childLogger.error({ error }, 'Failed to generate embedding');
    throw error;
  }
}

/**
 * Create hash for query deduplication in KBGap
 */
function hashQuery(query: string, companyId: string): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  return crypto
    .createHash('sha256')
    .update(`${companyId}:${normalized}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Detect and record KB gap when no answer is found
 */
export async function detectKBGap(
  query: string,
  companyId: string,
  channel: Channel
): Promise<void> {
  try {
    const queryHash = hashQuery(query, companyId);
    
    await KBGap.findOneAndUpdate(
      { companyId, queryHash },
      {
        $set: {
          query: query.slice(0, 1000), // Truncate for storage
          channel,
          lastOccurredAt: new Date(),
        },
        $inc: { frequency: 1 },
        $setOnInsert: {
          queryHash,
          status: 'open',
          firstOccurredAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    
    childLogger.info(
      { companyId, channel, queryPreview: query.slice(0, 50) },
      'KB gap detected and recorded'
    );

    // Emit activity event for KB gap
    await emitKBGap(companyId, query, channel);
  } catch (error) {
    childLogger.warn({ error, companyId }, 'Failed to record KB gap');
    // Non-blocking - don't throw
  }
}

/**
 * Search Knowledge Base and generate answer
 */
export async function searchKB(params: KBSearchParams): Promise<KBSearchResult> {
  const { query, companyId, language = 'en', channel, topK = PINECONE_CONFIG.TOP_K } = params;
  const startTime = Date.now();
  
  childLogger.debug(
    { companyId, language, channel, queryPreview: query.slice(0, 50) },
    'Starting KB search'
  );
  
  try {
    // Step 1: Generate embedding for query
    const embedding = await embedQuery(query);
    
    // Step 2: Query Pinecone
    const namespace = `${companyId}:${language}`;
    const queryResponse = await pineconeIndex.namespace(namespace).query({
      vector: embedding,
      topK,
      includeMetadata: true,
    });
    
    const matches = queryResponse.matches || [];
    
    // Step 3: Filter matches by score threshold (0.78)
    const relevantMatches = matches.filter(
      (match: PineconeMatch) => match.score && match.score > 0.78
    );
    
    childLogger.debug(
      { totalMatches: matches.length, relevantMatches: relevantMatches.length },
      'Pinecone query completed'
    );
    
    // Step 4: If no relevant matches, record gap and return empty
    if (relevantMatches.length === 0) {
      await detectKBGap(query, companyId, channel);
      
      return {
        answer: '',
        confidence: 0,
        sources: [],
      };
    }
    
    // Step 5: Extract context and sources
    const contexts: string[] = [];
    const sources: string[] = [];
    const seenTitles = new Set<string>();
    
    for (const match of relevantMatches) {
      const metadata = match.metadata;
      if (metadata?.text) {
        contexts.push(metadata.text as string);
      }
      if (metadata?.title && !seenTitles.has(metadata.title as string)) {
        seenTitles.add(metadata.title as string);
        sources.push(metadata.title as string);
      }
    }
    
    const highestScore = relevantMatches[0]?.score || 0;
    
    // Step 6: GPT-4o synthesis
    const maxTokens = channel === 'voice' ? 150 : 400;
    const contextText = contexts.join('\n\n---\n\n').slice(0, 8000);
    
    const completion = await openai.chat.completions.create({
      model: OPENAI_CONFIG.MODEL,
      temperature: 0.3,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: `You are a knowledgeable support assistant. Answer the user's question using ONLY the provided knowledge base context. Be concise and accurate. If the context doesn't contain enough information, say so. ${
            channel === 'voice'
              ? 'Keep your response brief and conversational for voice delivery.'
              : 'Provide a clear, well-structured response.'
          }`,
        },
        {
          role: 'user',
          content: `Knowledge Base Context:\n${contextText}\n\n---\n\nUser Question: ${query}`,
        },
      ],
    });
    
    const answer = completion.choices[0]?.message?.content?.trim() || '';
    
    const durationMs = Date.now() - startTime;
    childLogger.info(
      {
        companyId,
        channel,
        matchCount: relevantMatches.length,
        confidence: highestScore,
        answerLength: answer.length,
        durationMs,
      },
      'KB search completed'
    );
    
    return {
      answer,
      confidence: highestScore,
      sources,
    };
  } catch (error) {
    childLogger.error({ error, companyId, channel }, 'KB search failed');
    throw error;
  }
}

/**
 * Batch embed multiple texts (for indexing)
 */
export async function batchEmbed(
  texts: string[],
  batchSize: number = 20
): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    const response = await openai.embeddings.create({
      model: OPENAI_CONFIG.EMBEDDING_MODEL,
      input: batch.map((t) => t.slice(0, 8000)),
    });
    
    embeddings.push(...response.data.map((d) => d.embedding));
    
    childLogger.debug(
      { batch: Math.floor(i / batchSize) + 1, total: Math.ceil(texts.length / batchSize) },
      'Batch embedding progress'
    );
  }
  
  return embeddings;
}

/**
 * Delete vectors from Pinecone for a document
 */
export async function deleteDocumentVectors(
  companyId: string,
  documentId: string,
  language: string = 'en'
): Promise<void> {
  const namespace = `${companyId}:${language}`;
  
  try {
    // Pinecone requires fetching IDs first for filtered deletion
    // We use a prefix pattern: doc-{documentId}-chunk-*
    const prefix = `doc-${documentId}-chunk-`;
    
    // Delete by ID prefix (using deleteMany with filter)
    await pineconeIndex.namespace(namespace).deleteMany({
      filter: {
        documentId: { $eq: documentId },
      },
    });
    
    childLogger.info(
      { companyId, documentId, namespace },
      'Document vectors deleted from Pinecone'
    );
  } catch (error) {
    childLogger.error({ error, companyId, documentId }, 'Failed to delete document vectors');
    throw error;
  }
}

export default {
  embedQuery,
  searchKB,
  detectKBGap,
  batchEmbed,
  deleteDocumentVectors,
};

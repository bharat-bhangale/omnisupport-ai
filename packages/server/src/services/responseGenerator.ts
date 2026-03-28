import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { z } from 'zod';
import { env } from '../config/env.js';
import { OPENAI_CONFIG, PINECONE_CONFIG } from '../config/constants.js';
import { logger } from '../config/logger.js';

const childLogger = logger.child({ service: 'responseGenerator' });

// Initialize clients
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
const pineconeIndex = pinecone.index(env.PINECONE_INDEX);

// Zod schemas for validation
const KBSearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  score: z.number(),
});

const DraftResultSchema = z.object({
  draft: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sources: z.array(KBSearchResultSchema),
  toneApplied: z.enum(['professional', 'empathetic', 'technical']),
  needsReview: z.boolean(),
  reviewReason: z.string().optional(),
});

export type KBSearchResult = z.infer<typeof KBSearchResultSchema>;
export type DraftResult = z.infer<typeof DraftResultSchema>;
export type DraftTone = 'professional' | 'empathetic' | 'technical';

export interface GenerateDraftParams {
  ticketId: string;
  companyId: string;
  ticketBody: string;
  ticketSubject: string;
  category: string;
  customerHistory?: string;
  tone?: DraftTone;
  language?: string;
  customerName?: string;
  customerTier?: string;
}

export interface CompanyTextConfig {
  brandVoice?: string;
  signatureText?: string;
  disclaimers?: string[];
}

/**
 * Get embedding for text using OpenAI
 */
async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: OPENAI_CONFIG.EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

/**
 * Search knowledge base for relevant content
 */
export async function searchKB(params: {
  query: string;
  companyId: string;
  channel: 'text' | 'voice';
  language?: string;
  topK?: number;
}): Promise<KBSearchResult[]> {
  const { query, companyId, channel, language = 'en', topK = PINECONE_CONFIG.TOP_K } = params;

  try {
    const embedding = await getEmbedding(query);
    
    // Use company + language namespace
    const namespace = `${companyId}:${language}`;
    
    const results = await pineconeIndex.namespace(namespace).query({
      vector: embedding,
      topK,
      includeMetadata: true,
      filter: {
        channel: { $in: [channel, 'both'] },
        active: true,
      },
    });

    const kbResults: KBSearchResult[] = [];

    for (const match of results.matches || []) {
      if (match.score && match.score > 0.5 && match.metadata) {
        const meta = match.metadata as {
          title?: string;
          content?: string;
        };

        kbResults.push({
          id: match.id,
          title: meta.title || 'Untitled',
          content: meta.content || '',
          score: match.score,
        });
      }
    }

    childLogger.debug(
      { companyId, query: query.slice(0, 50), resultCount: kbResults.length },
      'KB search completed'
    );

    return kbResults;
  } catch (error) {
    childLogger.error({ error, companyId }, 'KB search failed');
    return [];
  }
}

/**
 * Fetch company text configuration (brand voice, etc.)
 */
async function fetchCompanyTextConfig(companyId: string): Promise<CompanyTextConfig> {
  try {
    // Dynamically import Company model to avoid circular deps
    const { default: mongoose } = await import('mongoose');
    const Company = mongoose.model('Company');
    
    const company = await Company.findById(companyId)
      .select('textConfig name')
      .lean()
      .exec();

    if (!company) {
      return {};
    }

    const textConfig = (company as { textConfig?: CompanyTextConfig }).textConfig || {};
    return textConfig;
  } catch (error) {
    childLogger.warn({ error, companyId }, 'Failed to fetch company config, using defaults');
    return {};
  }
}

/**
 * Build tone instruction based on selected tone
 */
function buildToneInstruction(tone: DraftTone): string {
  const toneInstructions: Record<DraftTone, string> = {
    professional: `
Maintain a professional, business-appropriate tone throughout.
- Use clear, precise language
- Avoid casual expressions or slang
- Be direct but courteous
- Use proper grammar and formatting`,
    empathetic: `
Use a warm, empathetic tone that acknowledges the customer's feelings.
- Start by acknowledging any frustration or concern
- Use phrases like "I understand" and "I'm here to help"
- Be patient and reassuring
- Show genuine care for their situation`,
    technical: `
Use a technical, detailed tone appropriate for expert users.
- Include specific technical details when relevant
- Use industry terminology appropriately
- Provide step-by-step instructions if applicable
- Reference documentation or specifications when helpful`,
  };

  return toneInstructions[tone];
}

/**
 * Determine if draft needs human review
 */
function shouldFlagForReview(
  confidence: number,
  category: string,
  kbResultCount: number
): { needsReview: boolean; reason?: string } {
  // Low confidence
  if (confidence < 0.6) {
    return { needsReview: true, reason: 'Low confidence score' };
  }

  // No KB sources found
  if (kbResultCount === 0) {
    return { needsReview: true, reason: 'No knowledge base sources found' };
  }

  // Sensitive categories
  const sensitiveCategories = ['legal', 'refund', 'complaint', 'billing_dispute', 'account_closure'];
  if (sensitiveCategories.some((c) => category.toLowerCase().includes(c))) {
    return { needsReview: true, reason: 'Sensitive category requires review' };
  }

  return { needsReview: false };
}

/**
 * Generate AI draft response for a ticket
 */
export async function generateDraft(params: GenerateDraftParams): Promise<DraftResult> {
  const {
    ticketId,
    companyId,
    ticketBody,
    ticketSubject,
    category,
    customerHistory,
    tone = 'professional',
    language = 'en',
    customerName,
    customerTier,
  } = params;

  childLogger.info(
    { ticketId, companyId, tone, category },
    'Generating draft response'
  );

  const startTime = Date.now();

  try {
    // Step 1: Search KB for relevant content
    const kbResults = await searchKB({
      query: `${ticketSubject} ${ticketBody}`,
      companyId,
      channel: 'text',
      language,
    });

    // Step 2: Fetch company brand voice config
    const companyConfig = await fetchCompanyTextConfig(companyId);
    const brandVoice = companyConfig.brandVoice || 'Friendly, professional, and helpful';

    // Step 3: Build tone instruction
    const toneInstruction = buildToneInstruction(tone);

    // Step 4: Format KB context
    const kbContext = kbResults.length > 0
      ? kbResults.map((r, i) => `[KB${i + 1}] ${r.title}:\n${r.content}`).join('\n\n')
      : 'No relevant knowledge base articles found.';

    // Step 5: Format customer history
    const historySection = customerHistory
      ? `Previous interactions:\n${customerHistory}`
      : 'No previous interaction history available.';

    // Step 6: Build customer context
    const customerContext = [
      customerName && `Customer Name: ${customerName}`,
      customerTier && `Customer Tier: ${customerTier}`,
    ]
      .filter(Boolean)
      .join('\n');

    // Step 7: Build GPT-4o prompt
    const systemPrompt = `You are a customer support agent for a company.
Brand Voice: ${brandVoice}

${toneInstruction}

IMPORTANT RULES:
1. Use ONLY information from the KB sections provided below
2. Do NOT make up information, policies, or promises
3. If the KB doesn't contain relevant info, acknowledge this and offer to escalate
4. Keep the response concise but complete
5. End with: "Is there anything else I can help you with?"
6. Format the response appropriately for email

${customerContext ? `\n${customerContext}` : ''}`;

    const userPrompt = `Knowledge Base:
${kbContext}

${historySection}

Ticket:
Subject: ${ticketSubject}
Description: ${ticketBody}

Generate a helpful response to this ticket.`;

    // Step 8: Call GPT-4o
    const response = await openai.chat.completions.create({
      model: OPENAI_CONFIG.MODEL,
      temperature: OPENAI_CONFIG.TEMPERATURE.GENERATION,
      max_tokens: OPENAI_CONFIG.MAX_TOKENS.RESPONSE,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const draftContent = response.choices[0]?.message?.content;
    if (!draftContent) {
      throw new Error('GPT-4o returned empty response');
    }

    // Step 9: Calculate confidence based on KB relevance
    const avgKbScore = kbResults.length > 0
      ? kbResults.reduce((sum, r) => sum + r.score, 0) / kbResults.length
      : 0.3;
    const confidence = Math.min(0.95, avgKbScore * 1.1); // Scale up slightly, cap at 0.95

    // Step 10: Check if needs review
    const reviewStatus = shouldFlagForReview(confidence, category, kbResults.length);

    // Step 11: Build result
    const result: DraftResult = {
      draft: draftContent.trim(),
      confidence,
      sources: kbResults,
      toneApplied: tone,
      needsReview: reviewStatus.needsReview,
      reviewReason: reviewStatus.reason,
    };

    // Validate result with Zod
    const validated = DraftResultSchema.parse(result);

    const duration = Date.now() - startTime;
    childLogger.info(
      { ticketId, companyId, confidence, kbSources: kbResults.length, duration },
      'Draft generated successfully'
    );

    return validated;
  } catch (error) {
    childLogger.error(
      { error, ticketId, companyId },
      'Failed to generate draft'
    );
    throw error;
  }
}

/**
 * Regenerate draft with different tone
 */
export async function regenerateDraftWithTone(
  ticketId: string,
  companyId: string,
  ticketSubject: string,
  ticketBody: string,
  category: string,
  newTone: DraftTone,
  customerHistory?: string
): Promise<DraftResult> {
  return generateDraft({
    ticketId,
    companyId,
    ticketBody,
    ticketSubject,
    category,
    customerHistory,
    tone: newTone,
  });
}

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { CONVERSATION_LIMITS } from '../config/constants.js';
import { formatCardForVoicePrompt } from './customerIntelligence.js';
import type {
  CallSessionState,
  SystemPromptParams,
  CustomerIntelligenceCard,
  Turn,
} from '../types/session.js';

/**
 * Build OpenAI messages array from session state for voice interactions
 * Implements conversation truncation for long conversations
 */
export function buildVoiceMessages(
  session: CallSessionState,
  systemPrompt: string,
  latestUtterance: string
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  // Add system prompt
  messages.push({
    role: 'system',
    content: systemPrompt,
  });

  // Get turns, applying truncation if needed
  let turns = session.turns;
  if (turns.length > CONVERSATION_LIMITS.MAX_TURNS_BEFORE_TRUNCATE) {
    // Keep first N turns for context + last M turns for recency
    const firstTurns = turns.slice(0, CONVERSATION_LIMITS.KEEP_FIRST_TURNS);
    const lastTurns = turns.slice(-CONVERSATION_LIMITS.KEEP_LAST_TURNS);

    // Add a summary marker between sections
    turns = [
      ...firstTurns,
      {
        role: 'system' as const,
        content: `[... ${turns.length - CONVERSATION_LIMITS.KEEP_FIRST_TURNS - CONVERSATION_LIMITS.KEEP_LAST_TURNS} earlier turns omitted for brevity ...]`,
        timestamp: new Date(),
      },
      ...lastTurns,
    ];
  }

  // Convert turns to OpenAI message format
  for (const turn of turns) {
    if (turn.role === 'tool') {
      // Handle tool responses
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: turn.toolCallId || 'unknown',
            type: 'function',
            function: {
              name: turn.toolName || 'unknown',
              arguments: '{}',
            },
          },
        ],
      });
      messages.push({
        role: 'tool',
        tool_call_id: turn.toolCallId || 'unknown',
        content: turn.content,
      });
    } else {
      messages.push({
        role: turn.role as 'user' | 'assistant' | 'system',
        content: turn.content,
      });
    }
  }

  // Add the latest utterance from the user
  messages.push({
    role: 'user',
    content: latestUtterance,
  });

  return messages;
}

/**
 * Build a system prompt with customer context and company configuration
 */
export function buildSystemPrompt(params: SystemPromptParams): string {
  const {
    companyName,
    agentName,
    agentGreeting,
    customerCard,
    language,
    proactiveContext,
    customInstructions,
    escalationThreshold = 3,
  } = params;

  const sections: string[] = [];

  // Identity section
  sections.push(`[IDENTITY]
You are ${agentName}, a friendly and professional AI customer support agent for ${companyName}.
Your greeting: "${agentGreeting}"
Be warm, empathetic, and solution-oriented. Keep responses conversational and concise.`);

  // Language section
  sections.push(`[LANGUAGE]
Respond in: ${getLanguageName(language)}
Maintain natural conversational flow appropriate for voice interaction.
Use contractions and casual phrasing when appropriate.`);

  // Customer context section
  if (customerCard) {
    sections.push(`[CUSTOMER CONTEXT]
${formatCardForVoicePrompt(customerCard)}`);
  }

  // Behavior section
  sections.push(`[BEHAVIOUR]
1. Listen actively and acknowledge customer concerns
2. Ask clarifying questions when needed
3. Provide accurate information based on available knowledge
4. If you cannot help, offer to escalate to a human agent
5. Never make up information - say "I don't have that information" if unsure
6. Keep responses under 3 sentences for voice delivery
7. Escalate if customer frustration level exceeds ${escalationThreshold} indicators
8. Always confirm actions before taking them`);

  // Proactive context section (e.g., KB results, recent updates)
  if (proactiveContext) {
    sections.push(`[PROACTIVE CONTEXT]
${proactiveContext}`);
  }

  // Custom company instructions
  if (customInstructions) {
    sections.push(`[CUSTOM INSTRUCTIONS]
${customInstructions}`);
  }

  return sections.join('\n\n');
}

/**
 * Convert language code to language name
 */
function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    nl: 'Dutch',
    pl: 'Polish',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    ar: 'Arabic',
    hi: 'Hindi',
    tr: 'Turkish',
    vi: 'Vietnamese',
    th: 'Thai',
    id: 'Indonesian',
    ms: 'Malay',
    fil: 'Filipino',
    sv: 'Swedish',
    no: 'Norwegian',
    da: 'Danish',
    fi: 'Finnish',
    cs: 'Czech',
    ro: 'Romanian',
    hu: 'Hungarian',
    el: 'Greek',
    he: 'Hebrew',
  };

  return languages[code] || 'English';
}

/**
 * Estimate token count for conversation (rough approximation)
 * Uses ~4 chars per token heuristic
 */
export function estimateTokenCount(turns: Turn[]): number {
  let totalChars = 0;
  for (const turn of turns) {
    totalChars += turn.content.length;
  }
  return Math.ceil(totalChars / 4);
}

/**
 * Build messages for ticket response generation
 */
export function buildTicketMessages(
  ticketSubject: string,
  ticketDescription: string,
  customerCard: CustomerIntelligenceCard | undefined,
  kbContext: string[],
  companyName: string,
  language: string
): ChatCompletionMessageParam[] {
  const systemPrompt = `You are an AI customer support assistant for ${companyName}.
Write a professional, helpful response to the customer ticket below.

Guidelines:
- Be empathetic and solution-oriented
- Reference the knowledge base context when relevant
- Keep the response concise but complete
- Use ${getLanguageName(language)} language
- Format for email/text (not voice)
${customerCard ? `\nCustomer: ${customerCard.name || 'Unknown'} (${customerCard.tier} tier)` : ''}`;

  const contextSection = kbContext.length > 0
    ? `\n\nRelevant Knowledge Base Information:\n${kbContext.map((c, i) => `[${i + 1}] ${c}`).join('\n')}`
    : '';

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Subject: ${ticketSubject}\n\nDescription:\n${ticketDescription}${contextSection}`,
    },
  ];
}

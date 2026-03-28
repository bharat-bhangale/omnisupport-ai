import React from 'react';
import type { TicketSentiment } from '../types/ticket';

interface SentimentBarProps {
  /** Sentiment score from -1 (negative) to 1 (positive), or sentiment label */
  sentiment: number | TicketSentiment;
  /** Whether to show the numeric score */
  showScore?: boolean;
  /** Height of the bar */
  height?: 'sm' | 'md';
}

function sentimentToScore(sentiment: TicketSentiment): number {
  switch (sentiment) {
    case 'positive':
      return 0.7;
    case 'neutral':
      return 0;
    case 'negative':
      return -0.5;
    case 'highly_negative':
      return -0.9;
    default:
      return 0;
  }
}

function scoreToLabel(score: number): string {
  if (score >= 0.5) return 'Positive';
  if (score >= 0.1) return 'Slightly Positive';
  if (score >= -0.1) return 'Neutral';
  if (score >= -0.5) return 'Slightly Negative';
  return 'Negative';
}

function scoreToEmoji(score: number): string {
  if (score >= 0.5) return '😊';
  if (score >= 0.1) return '🙂';
  if (score >= -0.1) return '😐';
  if (score >= -0.5) return '😕';
  return '😠';
}

export function SentimentBar({ 
  sentiment, 
  showScore = false,
  height = 'md',
}: SentimentBarProps): React.ReactElement {
  // Normalize sentiment to score (-1 to 1)
  const score = typeof sentiment === 'number' 
    ? sentiment 
    : sentimentToScore(sentiment);

  // Clamp score between -1 and 1
  const clampedScore = Math.max(-1, Math.min(1, score));
  
  // Convert to percentage position (0% = left/negative, 100% = right/positive)
  const position = ((clampedScore + 1) / 2) * 100;

  const heightClass = height === 'sm' ? 'h-2' : 'h-3';
  const markerSize = height === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const markerOffset = height === 'sm' ? '-top-0.5' : '-top-0.5';

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-600 flex items-center gap-1">
          <span>{scoreToEmoji(clampedScore)}</span>
          <span>{scoreToLabel(clampedScore)}</span>
        </span>
        {showScore && (
          <span className="text-xs text-gray-500 font-mono">
            {clampedScore >= 0 ? '+' : ''}{clampedScore.toFixed(2)}
          </span>
        )}
      </div>
      <div className={`relative ${heightClass} rounded-full overflow-hidden`}>
        {/* Gradient background: green (positive) → gray (neutral) → red (negative) */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to right, #ef4444, #f97316, #fbbf24, #9ca3af, #86efac, #22c55e)',
          }}
        />
        {/* Marker */}
        <div 
          className={`absolute ${markerOffset} ${markerSize} bg-white border-2 border-gray-800 rounded-full shadow-md transform -translate-x-1/2 transition-all duration-300`}
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>Negative</span>
        <span>Positive</span>
      </div>
    </div>
  );
}

interface SentimentEmojiProps {
  sentiment: number | TicketSentiment;
  size?: 'sm' | 'md' | 'lg';
}

export function SentimentEmoji({ sentiment, size = 'md' }: SentimentEmojiProps): React.ReactElement {
  const score = typeof sentiment === 'number' 
    ? sentiment 
    : sentimentToScore(sentiment);
  
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
  };

  return (
    <span 
      className={sizeClasses[size]} 
      title={scoreToLabel(score)}
    >
      {scoreToEmoji(score)}
    </span>
  );
}

export default SentimentBar;

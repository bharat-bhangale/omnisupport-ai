// ============================================================================
// LANGUAGE BADGE COMPONENT
// ============================================================================
// Shows flag emoji + language name in a small rounded pill

import {
  getLanguageName,
  getLanguageFlag,
  LANGUAGE_CATEGORY,
} from '../api/languagesApi';

interface LanguageBadgeProps {
  languageCode: string;
  detected?: boolean;
  size?: 'sm' | 'md';
  showName?: boolean;
}

export function LanguageBadge({
  languageCode,
  detected = false,
  size = 'md',
  showName = true,
}: LanguageBadgeProps) {
  const flag = getLanguageFlag(languageCode);
  const name = getLanguageName(languageCode);
  const category = LANGUAGE_CATEGORY[languageCode] || 'other';

  // Category-based colors
  const categoryColors = {
    english: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    indian: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    european: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    asian: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    other: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs gap-1',
    md: 'px-2 py-1 text-sm gap-1.5',
  };

  return (
    <div className="inline-flex flex-col items-start">
      <span
        className={`
          inline-flex items-center rounded-full border font-medium
          ${categoryColors[category]}
          ${sizeClasses[size]}
        `}
      >
        <span className={size === 'sm' ? 'text-sm' : 'text-base'}>{flag}</span>
        {showName && <span>{name}</span>}
      </span>
      {detected && (
        <span className="text-[10px] text-slate-500 mt-0.5 ml-1">
          Auto-detected
        </span>
      )}
    </div>
  );
}

// ============================================================================
// LANGUAGE BADGE WITH PULSE ANIMATION (for auto-detection)
// ============================================================================

interface AnimatedLanguageBadgeProps extends LanguageBadgeProps {
  isDetecting?: boolean;
}

export function AnimatedLanguageBadge({
  languageCode,
  detected,
  size,
  showName,
  isDetecting = false,
}: AnimatedLanguageBadgeProps) {
  return (
    <div className={isDetecting ? 'animate-pulse' : ''}>
      <LanguageBadge
        languageCode={languageCode}
        detected={detected}
        size={size}
        showName={showName}
      />
    </div>
  );
}

export default LanguageBadge;

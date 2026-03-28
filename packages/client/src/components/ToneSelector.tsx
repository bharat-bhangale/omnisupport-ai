import React from 'react';
import { Loader2 } from 'lucide-react';
import type { DraftTone } from '../types/ticket';

interface ToneSelectorProps {
  selected: DraftTone;
  onChange: (tone: DraftTone) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const toneOptions: { value: DraftTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'technical', label: 'Technical' },
];

export function ToneSelector({
  selected,
  onChange,
  disabled = false,
  size = 'md',
}: ToneSelectorProps): React.ReactElement {
  const sizeClasses = size === 'sm' 
    ? 'px-2.5 py-1 text-xs' 
    : 'px-3.5 py-1.5 text-sm';

  return (
    <div className="flex items-center gap-1">
      {disabled && (
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin mr-1" />
      )}
      {toneOptions.map((option) => {
        const isActive = selected === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`
              ${sizeClasses} rounded-full font-medium transition-colors
              ${isActive
                ? 'bg-blue-500 text-white'
                : 'bg-transparent border border-blue-500 text-blue-500 hover:bg-blue-50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default ToneSelector;

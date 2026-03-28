import React, { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, Check, ChevronDown, Loader2 } from 'lucide-react';
import { useSubmitDraftFeedbackMutation } from '../api/ticketsApi';

interface DraftFeedbackRowProps {
  ticketId: string;
  currentRating?: 'helpful' | 'not_helpful';
}

const issueOptions = [
  { value: 'wrong_tone', label: 'Wrong tone' },
  { value: 'inaccurate_info', label: 'Incorrect information' },
  { value: 'incomplete_response', label: 'Missing context' },
  { value: 'too_long', label: 'Too long' },
  { value: 'too_short', label: 'Too short' },
  { value: 'other', label: 'Other' },
];

export function DraftFeedbackRow({
  ticketId,
  currentRating,
}: DraftFeedbackRowProps): React.ReactElement {
  const [rating, setRating] = useState<'helpful' | 'not_helpful' | null>(currentRating || null);
  const [showIssueDropdown, setShowIssueDropdown] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(!!currentRating);

  const [submitFeedback, { isLoading }] = useSubmitDraftFeedbackMutation();

  const handleHelpful = useCallback(async () => {
    setRating('helpful');
    try {
      await submitFeedback({
        id: ticketId,
        data: { helpful: true },
      }).unwrap();
      setSubmitted(true);
    } catch {
      setRating(null);
    }
  }, [submitFeedback, ticketId]);

  const handleNotHelpful = useCallback(() => {
    setRating('not_helpful');
    setShowIssueDropdown(true);
  }, []);

  const handleIssueSelect = useCallback(async (issue: string) => {
    setSelectedIssue(issue);
    setShowIssueDropdown(false);
    try {
      await submitFeedback({
        id: ticketId,
        data: { helpful: false, reason: issue },
      }).unwrap();
      setSubmitted(true);
    } catch {
      setRating(null);
      setSelectedIssue(null);
    }
  }, [submitFeedback, ticketId]);

  // Already submitted state
  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-green-600 py-2">
        <Check className="w-4 h-4" />
        <span className="text-sm font-medium">Thanks for your feedback!</span>
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">Was this AI draft helpful?</span>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleHelpful}
            disabled={isLoading || rating === 'helpful'}
            className={`
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${rating === 'helpful'
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-600 border border-transparent'
              }
              ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isLoading && rating === 'helpful' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ThumbsUp className="w-4 h-4" />
            )}
            Helpful
          </button>

          <div className="relative">
            <button
              onClick={handleNotHelpful}
              disabled={isLoading}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${rating === 'not_helpful'
                  ? 'bg-red-100 text-red-700 border border-red-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 border border-transparent'
                }
              `}
            >
              <ThumbsDown className="w-4 h-4" />
              Not Helpful
              {showIssueDropdown && <ChevronDown className="w-3 h-3 ml-1" />}
            </button>

            {/* Issue Dropdown */}
            {showIssueDropdown && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                <div className="px-3 py-1.5 text-xs text-gray-500 font-medium uppercase">
                  What was wrong?
                </div>
                {issueOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleIssueSelect(option.value)}
                    disabled={isLoading}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    {isLoading && selectedIssue === option.value ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span className="w-4" />
                    )}
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DraftFeedbackRow;

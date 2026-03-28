import React, { useState, useCallback, useEffect } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  Send, 
  X, 
  ThumbsUp, 
  ThumbsDown, 
  AlertTriangle,
  BookOpen,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Ticket, DraftTone, KBArticleRef } from '../types/ticket';
import { useRegenerateDraftMutation, useSendResponseMutation, useSubmitDraftFeedbackMutation } from '../api/ticketsApi';

interface AIDraftPanelProps {
  ticket: Ticket;
  onDraftSent?: () => void;
}

const toneOptions: { value: DraftTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'technical', label: 'Technical' },
];

function getConfidenceBadge(confidence: number): { bg: string; text: string; label: string } {
  if (confidence >= 0.8) {
    return { bg: 'bg-green-100', text: 'text-green-700', label: `${Math.round(confidence * 100)}% confidence` };
  }
  if (confidence >= 0.6) {
    return { bg: 'bg-amber-100', text: 'text-amber-700', label: `${Math.round(confidence * 100)}% confidence` };
  }
  return { bg: 'bg-red-100', text: 'text-red-700', label: `${Math.round(confidence * 100)}% confidence` };
}

export function AIDraftPanel({ ticket, onDraftSent }: AIDraftPanelProps): React.ReactElement | null {
  const [editedContent, setEditedContent] = useState<string>(ticket.aiDraft?.content ?? '');
  const [selectedTone, setSelectedTone] = useState<DraftTone>(ticket.aiDraft?.tone ?? 'professional');
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);

  const [regenerateDraft, { isLoading: isRegenerating }] = useRegenerateDraftMutation();
  const [sendResponse, { isLoading: isSending }] = useSendResponseMutation();
  const [submitDraftFeedback] = useSubmitDraftFeedbackMutation();

  // Sync edited content when ticket draft changes
  useEffect(() => {
    if (ticket.aiDraft?.content) {
      setEditedContent(ticket.aiDraft.content);
      if (ticket.aiDraft.tone) {
        setSelectedTone(ticket.aiDraft.tone);
      }
    }
  }, [ticket.aiDraft?.content, ticket.aiDraft?.tone]);

  const handleToneChange = useCallback(async (tone: DraftTone) => {
    setSelectedTone(tone);
    try {
      await regenerateDraft({ id: ticket._id, tone }).unwrap();
      toast.success('Draft regenerated with new tone');
    } catch {
      toast.error('Failed to regenerate draft');
    }
  }, [regenerateDraft, ticket._id]);

  const handleRegenerate = useCallback(async () => {
    try {
      await regenerateDraft({ id: ticket._id, tone: selectedTone }).unwrap();
      toast.success('Draft regenerated');
    } catch {
      toast.error('Failed to regenerate draft');
    }
  }, [regenerateDraft, ticket._id, selectedTone]);

  const handleSendResponse = useCallback(async () => {
    const hasEdits = editedContent !== ticket.aiDraft?.content;
    try {
      await sendResponse({
        id: ticket._id,
        data: {
          action: hasEdits ? 'edit' : 'approve',
          editedContent: hasEdits ? editedContent : undefined,
          sendToExternal: true,
        },
      }).unwrap();
      toast.success('Response sent successfully');
      onDraftSent?.();
    } catch {
      toast.error('Failed to send response');
    }
  }, [sendResponse, ticket._id, ticket.aiDraft?.content, editedContent, onDraftSent]);

  const handleDiscard = useCallback(() => {
    setEditedContent(ticket.aiDraft?.content ?? '');
    toast('Draft discarded');
  }, [ticket.aiDraft?.content]);

  const handleFeedback = useCallback(async (helpful: boolean) => {
    setFeedbackGiven(helpful ? 'up' : 'down');
    try {
      await submitDraftFeedback({
        id: ticket._id,
        data: { helpful },
      }).unwrap();
      toast.success('Thanks for your feedback!');
    } catch {
      toast.error('Failed to submit feedback');
    }
  }, [submitDraftFeedback, ticket._id]);

  // No draft available
  if (!ticket.aiDraft) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm">AI draft not yet available</span>
        </div>
      </div>
    );
  }

  const draft = ticket.aiDraft;
  const confidence = ticket.classification?.confidence ?? 0.5;
  const confidenceBadge = getConfidenceBadge(confidence);
  const kbArticles: KBArticleRef[] = ticket.ragContext?.articles ?? [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Flagged for Review Banner */}
      {ticket.flaggedForReview && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="text-sm text-amber-700 font-medium">
            Flagged for Review
          </span>
          {draft.reviewReason && (
            <span className="text-sm text-amber-600">— {draft.reviewReason}</span>
          )}
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <span className="font-medium text-gray-900">AI Draft Response</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${confidenceBadge.bg} ${confidenceBadge.text}`}>
          {confidenceBadge.label}
        </span>
      </div>

      {/* KB Source Citations */}
      {kbArticles.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
          {kbArticles.map((article) => (
            <span
              key={article.id}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100"
              title={`Relevance: ${Math.round(article.score * 100)}%`}
            >
              {article.title}
            </span>
          ))}
        </div>
      )}

      {/* Tone Selector */}
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Tone:</span>
          <div className="flex gap-1">
            {toneOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleToneChange(option.value)}
                disabled={isRegenerating}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  selectedTone === option.value
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } ${isRegenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Editable Draft Content */}
      <div className="p-4">
        {isRegenerating ? (
          <div className="bg-gray-800 rounded-lg p-4 min-h-[150px] flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Regenerating draft...</span>
            </div>
          </div>
        ) : (
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="w-full min-h-[150px] p-3 bg-gray-800 text-white rounded-lg resize-y font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="AI draft will appear here..."
          />
        )}
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={handleSendResponse}
            disabled={isSending || isRegenerating || !editedContent.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send Response
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-600 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
            Regenerate
          </button>
          <button
            onClick={handleDiscard}
            disabled={isRegenerating}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <X className="w-4 h-4" />
            Discard
          </button>
        </div>

        {/* Feedback Row */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 mr-2">Helpful?</span>
          <button
            onClick={() => handleFeedback(true)}
            disabled={feedbackGiven !== null}
            className={`p-1.5 rounded transition-colors ${
              feedbackGiven === 'up'
                ? 'bg-green-100 text-green-600'
                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
            } ${feedbackGiven !== null ? 'cursor-not-allowed' : ''}`}
            title="Yes, helpful"
          >
            <ThumbsUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleFeedback(false)}
            disabled={feedbackGiven !== null}
            className={`p-1.5 rounded transition-colors ${
              feedbackGiven === 'down'
                ? 'bg-red-100 text-red-600'
                : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
            } ${feedbackGiven !== null ? 'cursor-not-allowed' : ''}`}
            title="No, not helpful"
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default AIDraftPanel;

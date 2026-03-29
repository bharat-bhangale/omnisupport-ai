import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Target,
  Lightbulb,
  ArrowUpDown,
  Smile,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useReviewQAReportMutation, type QAReport, type QADimensionScore } from '../api/qaApi';

// Default minimum pass scores (should match backend)
const DEFAULT_MIN_PASS_SCORES: Record<string, number> = {
  intentUnderstanding: 6,
  responseAccuracy: 7,
  resolutionSuccess: 6,
  escalationCorrectness: 7,
  customerExperience: 6,
};

interface QAScoreCardProps {
  report: QAReport;
  compact?: boolean;
  onReviewed?: () => void;
}

// Get score color based on value (0-100 or 0-10)
function getScoreColor(score: number, max: number = 100): string {
  const normalized = max === 10 ? score * 10 : score;
  if (normalized >= 80) return 'text-green-600';
  if (normalized >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreRingColor(score: number): string {
  if (score >= 80) return 'stroke-green-500';
  if (score >= 60) return 'stroke-amber-500';
  return 'stroke-red-500';
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-50';
  if (score >= 60) return 'bg-amber-50';
  return 'bg-red-50';
}

// Dimension display names and icons
const dimensionConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  intentUnderstanding: { label: 'Intent Understanding', icon: <Target className="h-4 w-4" /> },
  responseAccuracy: { label: 'Response Accuracy', icon: <CheckCircle2 className="h-4 w-4" /> },
  resolutionSuccess: { label: 'Resolution Success', icon: <Lightbulb className="h-4 w-4" /> },
  escalationCorrectness: { label: 'Escalation Correctness', icon: <ArrowUpDown className="h-4 w-4" /> },
  customerExperience: { label: 'Customer Experience', icon: <Smile className="h-4 w-4" /> },
};

export default function QAScoreCard({ report, compact = false, onReviewed }: QAScoreCardProps) {
  if (compact) {
    return <CompactScoreCard score={report.overallScore} />;
  }

  return <FullScoreCard report={report} onReviewed={onReviewed} />;
}

// Compact circular score badge
function CompactScoreCard({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 18; // radius = 18
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 44 44">
          {/* Background circle */}
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            strokeWidth="4"
            className="stroke-gray-200"
          />
          {/* Score circle */}
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className={getScoreRingColor(score)}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: offset,
              transition: 'stroke-dashoffset 0.5s ease-out',
            }}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${getScoreColor(score)}`}
        >
          {score}
        </span>
      </div>
      <span className="text-xs text-gray-500 mt-1">QA: {score}</span>
    </div>
  );
}

// Full QA report card
function FullScoreCard({ report, onReviewed }: { report: QAReport; onReviewed?: () => void }) {
  const [reviewNote, setReviewNote] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewQAReport, { isLoading }] = useReviewQAReportMutation();

  const handleReview = async () => {
    if (!reviewNote.trim()) {
      toast.error('Please enter a review note');
      return;
    }

    try {
      await reviewQAReport({ id: report._id, reviewNote }).unwrap();
      toast.success('Report marked as reviewed');
      setShowReviewForm(false);
      setReviewNote('');
      onReviewed?.();
    } catch {
      toast.error('Failed to mark as reviewed');
    }
  };

  const dimensions = Object.entries(report.dimensions) as Array<[string, QADimensionScore]>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Flagged banner */}
      {report.flaggedForReview && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <span className="text-amber-800 font-medium">Flagged for Review</span>
          <span className="text-amber-600 text-sm">
            ({report.flaggedDimensions.length} dimension{report.flaggedDimensions.length !== 1 ? 's' : ''} below threshold)
          </span>
        </div>
      )}

      {/* Header with overall score */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">QA Score Report</h3>
            <p className="text-sm text-gray-500 mt-1">
              {report.channel === 'voice' ? 'Voice Call' : 'Text Ticket'} •{' '}
              {new Date(report.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* Large overall score */}
          <div className={`rounded-xl px-6 py-4 ${getScoreBgColor(report.overallScore)}`}>
            <div className={`text-4xl font-bold ${getScoreColor(report.overallScore)}`}>
              {report.overallScore}
            </div>
            <div className="text-xs text-gray-500 text-center mt-1">Overall</div>
          </div>
        </div>
      </div>

      {/* Dimension rows */}
      <div className="divide-y divide-gray-100">
        {dimensions.map(([key, dimension]) => {
          const config = dimensionConfig[key] || { label: key, icon: null };
          const isFlagged = report.flaggedDimensions.includes(key);
          const minPass = DEFAULT_MIN_PASS_SCORES[key] || 6;

          return (
            <div
              key={key}
              className={`p-4 ${isFlagged ? 'border-l-4 border-l-red-500 bg-red-50/50' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">{config.icon}</span>
                  <span className="font-medium text-gray-900">{config.label}</span>
                  {isFlagged && (
                    <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                      Below {minPass}/10
                    </span>
                  )}
                </div>
                <span className={`text-lg font-bold ${getScoreColor(dimension.score, 10)}`}>
                  {dimension.score}/10
                </span>
              </div>

              {/* Score bar */}
              <div className="w-full h-2 bg-gray-200 rounded-full mb-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    dimension.score >= 8
                      ? 'bg-green-500'
                      : dimension.score >= 6
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${dimension.score * 10}%` }}
                />
              </div>

              {/* Reasoning */}
              <p className="text-sm text-gray-500 italic">{dimension.reasoning}</p>
            </div>
          );
        })}
      </div>

      {/* Review section */}
      <div className="p-4 bg-gray-50 border-t border-gray-100">
        {report.reviewedBy ? (
          <div className="flex items-start gap-3">
            <MessageSquare className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-sm text-gray-900">
                <span className="font-medium">Reviewed by {report.reviewedBy.name}</span>
              </p>
              {report.reviewNote && (
                <p className="text-sm text-gray-600 mt-1">{report.reviewNote}</p>
              )}
            </div>
          </div>
        ) : report.flaggedForReview ? (
          <>
            {showReviewForm ? (
              <div className="space-y-3">
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Enter your review notes..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleReview}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Submit Review
                  </button>
                  <button
                    onClick={() => setShowReviewForm(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowReviewForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm hover:bg-amber-200"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark Reviewed
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            No issues flagged
          </div>
        )}
      </div>
    </div>
  );
}

// Simple inline score badge for tables
export function QAScoreBadge({ score }: { score: number }) {
  if (score === undefined || score === null) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        score >= 80
          ? 'bg-green-100 text-green-700'
          : score >= 60
            ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
      }`}
    >
      QA: {score}
    </span>
  );
}

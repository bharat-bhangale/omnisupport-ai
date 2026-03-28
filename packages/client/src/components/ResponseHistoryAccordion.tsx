import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, User, Sparkles, Edit3, Loader2 } from 'lucide-react';
import { useGetResponseHistoryQuery } from '../api/ticketsApi';

interface ResponseHistoryAccordionProps {
  ticketId: string;
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getToneBadgeColor(tone: string): string {
  switch (tone) {
    case 'professional':
      return 'bg-blue-100 text-blue-700';
    case 'empathetic':
      return 'bg-purple-100 text-purple-700';
    case 'technical':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export function ResponseHistoryAccordion({
  ticketId,
}: ResponseHistoryAccordionProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching } = useGetResponseHistoryQuery(ticketId, {
    skip: !isExpanded,
  });

  const responses = data?.responses || [];
  const count = responses.length;

  const toggleItem = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <span className="text-sm font-medium text-gray-700">
            Response History {isExpanded && count > 0 ? `(${count})` : ''}
          </span>
        </div>
        {isFetching && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="bg-white">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : responses.length === 0 ? (
            <div className="py-6 text-center text-gray-500 text-sm">
              No responses sent yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {responses.map((response) => {
                const isItemExpanded = expandedItems.has(response.id);
                return (
                  <div key={response.id} className="p-4">
                    {/* Response Header */}
                    <div className="flex items-center flex-wrap gap-2 mb-2">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(response.sentAt)}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <User className="w-3 h-3" />
                        Sent by: {response.agentName}
                      </div>
                      {response.agentEdited ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                          <Edit3 className="w-3 h-3" />
                          Edited by Agent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">
                          <Sparkles className="w-3 h-3" />
                          AI Draft
                        </span>
                      )}
                      {response.toneApplied && (
                        <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${getToneBadgeColor(response.toneApplied)}`}>
                          {response.toneApplied}
                        </span>
                      )}
                    </div>

                    {/* Response Text */}
                    <div
                      className={`text-sm text-gray-700 ${
                        isItemExpanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {response.responseText}
                    </div>

                    {/* Expand/Collapse */}
                    {response.responseText.length > 150 && (
                      <button
                        onClick={() => toggleItem(response.id)}
                        className="text-xs text-blue-600 hover:text-blue-700 mt-1"
                      >
                        {isItemExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ResponseHistoryAccordion;

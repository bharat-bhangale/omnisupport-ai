import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  FileText,
  AlertTriangle,
  Loader2,
  AlertCircle,
  Save,
  X,
} from 'lucide-react';
import { CustomerContextCard } from '../components/CustomerContextCard';
import {
  useGetCustomerQuery,
  useUpdateCustomerMutation,
  useFlagAtRiskMutation,
} from '../api/customersApi';

export function CustomerProfile() {
  const { id } = useParams<{ id: string }>();
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [flagReason, setFlagReason] = useState('');

  const { data, isLoading, error } = useGetCustomerQuery(id || '', {
    skip: !id,
  });

  const [updateCustomer, { isLoading: isUpdating }] = useUpdateCustomerMutation();
  const [flagAtRisk, { isLoading: isFlagging }] = useFlagAtRiskMutation();

  const handleSaveNote = async () => {
    if (!id || !noteText.trim()) return;

    try {
      const existingNotes = data?.customer?.notes || '';
      const newNotes = existingNotes
        ? `${existingNotes}\n\n[${new Date().toLocaleString()}]\n${noteText}`
        : `[${new Date().toLocaleString()}]\n${noteText}`;

      await updateCustomer({ id, data: { notes: newNotes } }).unwrap();
      setNoteText('');
      setShowNoteModal(false);
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  };

  const handleFlagAtRisk = async () => {
    if (!id || !flagReason.trim()) return;

    try {
      await flagAtRisk({ id, reason: flagReason }).unwrap();
      setFlagReason('');
      setShowFlagModal(false);
    } catch (err) {
      console.error('Failed to flag customer:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500">
        <AlertCircle className="w-12 h-12 mb-4" />
        <p className="text-lg">Customer not found</p>
        <Link to="/customers" className="mt-4 text-blue-600 hover:text-blue-700">
          Back to Customers
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                to="/customers"
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-lg font-semibold text-gray-900">Customer Profile</h1>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNoteModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <FileText className="w-4 h-4" />
                Log Note
              </button>
              <button
                onClick={() => {}}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Plus className="w-4 h-4" />
                Create Ticket
              </button>
              <button
                onClick={() => setShowFlagModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
              >
                <AlertTriangle className="w-4 h-4" />
                Flag At-Risk
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <CustomerContextCard
          card={data.customer}
          mode="full"
          recentCalls={data.recentCalls}
          recentTickets={data.recentTickets}
          sentimentData={data.sentimentTimeline}
        />
      </div>

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Add Internal Note</h2>
              <button
                onClick={() => setShowNoteModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Enter your note..."
                className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 bg-gray-50 rounded-b-lg">
              <button
                onClick={() => setShowNoteModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                disabled={isUpdating || !noteText.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flag At-Risk Modal */}
      {showFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Flag Customer At-Risk</h2>
              <button
                onClick={() => setShowFlagModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for flagging
              </label>
              <select
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="">Select a reason...</option>
                <option value="multiple_complaints">Multiple complaints</option>
                <option value="negative_sentiment">Negative sentiment trend</option>
                <option value="payment_issues">Payment issues</option>
                <option value="service_issues">Recurring service issues</option>
                <option value="competitor_mention">Mentioned competitor</option>
                <option value="cancellation_intent">Expressed cancellation intent</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 bg-gray-50 rounded-b-lg">
              <button
                onClick={() => setShowFlagModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleFlagAtRisk}
                disabled={isFlagging || !flagReason}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFlagging ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                Flag At-Risk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerProfile;

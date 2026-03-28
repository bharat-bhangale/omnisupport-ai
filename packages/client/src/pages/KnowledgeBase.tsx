import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  FileText,
  Link2,
  Upload,
  Search,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Plus,
  TrendingUp,
  HelpCircle,
  X,
  Globe,
  File,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetKBDocumentsQuery,
  useUploadKBDocumentMutation,
  useAddKBUrlMutation,
  useDeleteKBDocumentMutation,
  useTestKBSearchMutation,
  useGetKBGapsQuery,
  useResolveKBGapMutation,
} from '../api/kbApi';
import { useKBSocket } from '../hooks/useKBSocket';
import { KBStatusBadge } from '../components/KBStatusBadge';
import type { KBDocument, KBDocumentType, KBSearchResult, KBGap } from '../types/kb';

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FILE_TYPES = { 'application/pdf': ['.pdf'] };

// Helper to format date
function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Helper to get type icon
function TypeIcon({ type }: { type: KBDocumentType }): React.ReactElement {
  switch (type) {
    case 'pdf':
      return <File className="w-4 h-4 text-red-500" />;
    case 'url':
      return <Globe className="w-4 h-4 text-blue-500" />;
    default:
      return <FileText className="w-4 h-4 text-gray-500" />;
  }
}

// Confidence badge component
function ConfidenceBadge({ confidence }: { confidence: number }): React.ReactElement {
  let bg: string, text: string, label: string;
  
  if (confidence >= 0.8) {
    bg = 'bg-green-100';
    text = 'text-green-700';
    label = 'High Confidence';
  } else if (confidence >= 0.5) {
    bg = 'bg-amber-100';
    text = 'text-amber-700';
    label = 'Medium Confidence';
  } else {
    bg = 'bg-red-100';
    text = 'text-red-700';
    label = 'Low Confidence';
  }
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
      {label} ({Math.round(confidence * 100)}%)
    </span>
  );
}

// Delete confirmation modal
function DeleteModal({
  document,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  document: KBDocument;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 rounded-full">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Delete Document</h3>
        </div>
        <p className="text-gray-600 mb-6">
          Are you sure you want to delete <span className="font-medium">"{document.title}"</span>?
          This action cannot be undone and all indexed chunks will be removed.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function KnowledgeBase(): React.ReactElement {
  // State
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<KBSearchResult | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<KBDocument | null>(null);
  const [expandedGapId, setExpandedGapId] = useState<string | null>(null);
  const [gapAnswer, setGapAnswer] = useState('');
  const [indexingProgress, setIndexingProgress] = useState<Record<string, number>>({});

  // RTK Query hooks
  const { data: documentsData, isLoading: isLoadingDocs, refetch: refetchDocs } = useGetKBDocumentsQuery();
  const { data: gapsData, isLoading: isLoadingGaps } = useGetKBGapsQuery();
  const [uploadDocument, { isLoading: isUploading }] = useUploadKBDocumentMutation();
  const [addUrl, { isLoading: isAddingUrl }] = useAddKBUrlMutation();
  const [deleteDocument, { isLoading: isDeleting }] = useDeleteKBDocumentMutation();
  const [testSearch, { isLoading: isSearching }] = useTestKBSearchMutation();
  const [resolveGap, { isLoading: isResolvingGap }] = useResolveKBGapMutation();

  // Socket hook for real-time updates
  useKBSocket({
    enabled: true,
    onIndexProgress: (event) => {
      setIndexingProgress((prev) => ({
        ...prev,
        [event.documentId]: event.progress,
      }));
      
      if (event.status === 'indexed') {
        toast.success('Document indexed successfully');
        setIndexingProgress((prev) => {
          const updated = { ...prev };
          delete updated[event.documentId];
          return updated;
        });
      } else if (event.status === 'error') {
        toast.error(event.errorMessage || 'Indexing failed');
        setIndexingProgress((prev) => {
          const updated = { ...prev };
          delete updated[event.documentId];
          return updated;
        });
      }
    },
  });

  // Dropzone config
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];
      if (file.size > MAX_FILE_SIZE) {
        toast.error('File size must be less than 10MB');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace('.pdf', ''));

      try {
        await uploadDocument(formData).unwrap();
        toast.success('Document uploaded and queued for indexing');
      } catch (error) {
        toast.error('Failed to upload document');
      }
    },
    [uploadDocument]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
    disabled: isUploading,
  });

  // Handle URL add
  const handleAddUrl = async () => {
    if (!urlInput.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      new URL(urlInput);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    try {
      await addUrl({ url: urlInput, title: urlTitle || undefined }).unwrap();
      toast.success('URL added and queued for indexing');
      setUrlInput('');
      setUrlTitle('');
      setShowUrlInput(false);
    } catch (error) {
      toast.error('Failed to add URL');
    }
  };

  // Handle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    try {
      const result = await testSearch({ query: searchQuery }).unwrap();
      setSearchResult(result);
    } catch (error) {
      toast.error('Search failed');
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteDoc) return;

    try {
      await deleteDocument(deleteDoc._id).unwrap();
      toast.success('Document deleted');
      setDeleteDoc(null);
    } catch (error) {
      toast.error('Failed to delete document');
    }
  };

  // Handle gap resolution
  const handleResolveGap = async (gapId: string) => {
    if (!gapAnswer.trim()) {
      toast.error('Please enter an answer');
      return;
    }

    try {
      await resolveGap({ id: gapId, data: { answer: gapAnswer, createDocument: true } }).unwrap();
      toast.success('Answer saved to knowledge base');
      setExpandedGapId(null);
      setGapAnswer('');
    } catch (error) {
      toast.error('Failed to save answer');
    }
  };

  // Memoized document list with progress
  const documents = useMemo(() => {
    if (!documentsData?.documents) return [];
    return documentsData.documents.map((doc) => ({
      ...doc,
      currentProgress: indexingProgress[doc._id],
    }));
  }, [documentsData, indexingProgress]);

  // Filter gaps to show only top 10 unresolved
  const gaps = useMemo(() => {
    if (!gapsData?.gaps) return [];
    return gapsData.gaps.filter((g) => !g.resolved).slice(0, 10);
  }, [gapsData]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-900">Knowledge Base</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage documents and URLs that power AI responses
        </p>
      </div>

      {/* Main content - 2 column layout */}
      <div className="flex p-6 gap-6">
        {/* LEFT - Document Library (65%) */}
        <div className="w-[65%] space-y-6">
          {/* Header with actions */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">Document Library</h2>
                <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                  {documentsData?.total ?? 0} documents
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Link2 className="w-4 h-4" />
                  Add URL
                </button>
                <div
                  {...getRootProps()}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  <input {...getInputProps()} />
                  <Upload className="w-4 h-4" />
                  Upload Document
                </div>
              </div>
            </div>

            {/* URL Input Section */}
            {showUrlInput && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      URL
                    </label>
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://example.com/docs"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title (optional)
                    </label>
                    <input
                      type="text"
                      value={urlTitle}
                      onChange={(e) => setUrlTitle(e.target.value)}
                      placeholder="Document title"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setShowUrlInput(false);
                        setUrlInput('');
                        setUrlTitle('');
                      }}
                      className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddUrl}
                      disabled={isAddingUrl || !urlInput.trim()}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isAddingUrl && <Loader2 className="w-4 h-4 animate-spin" />}
                      Add URL
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input {...getInputProps()} />
              <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
              {isDragActive ? (
                <p className="text-blue-600 font-medium">Drop the file here...</p>
              ) : (
                <>
                  <p className="text-gray-600">
                    Drag & drop a PDF here, or click to select
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PDF only, max 10MB</p>
                </>
              )}
              {isUploading && (
                <div className="flex items-center justify-center gap-2 mt-2 text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading...</span>
                </div>
              )}
            </div>
          </div>

          {/* Document Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {isLoadingDocs ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mb-3 text-gray-300" />
                <p className="font-medium">No documents yet</p>
                <p className="text-sm">Upload a PDF or add a URL to get started</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Chunks
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Indexed
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {documents.map((doc) => (
                    <tr key={doc._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TypeIcon type={doc.type} />
                          <span className="font-medium text-gray-900 truncate max-w-[200px]">
                            {doc.title}
                          </span>
                          {doc.sourceUrl && (
                            <a
                              href={doc.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 uppercase">
                        {doc.type}
                      </td>
                      <td className="px-4 py-3">
                        <KBStatusBadge
                          status={doc.status}
                          progress={doc.currentProgress}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {doc.chunks > 0 ? doc.chunks : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(doc.lastIndexed)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSearchQuery(`doc:${doc._id}`);
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Test search"
                          >
                            <Search className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteDoc(doc)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT - Search & Gaps (35%) */}
        <div className="w-[35%] space-y-6">
          {/* Test KB Search */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-gray-500" />
              Test KB Search
            </h3>
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter a test query..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Search
                </button>
              </div>

              {/* Search Results */}
              {searchResult && (
                <div className="space-y-3">
                  <ConfidenceBadge confidence={searchResult.confidence} />
                  
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {searchResult.answer}
                    </p>
                  </div>

                  {searchResult.sources.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Sources</p>
                      <div className="flex flex-wrap gap-2">
                        {searchResult.sources.map((source, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-full"
                            title={source.snippet}
                          >
                            <FileText className="w-3 h-3" />
                            {source.documentTitle}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setSearchResult(null)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear results
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* KB Gaps */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-gray-500" />
              KB Gaps This Week
            </h3>

            {isLoadingGaps ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : gaps.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
                <p className="font-medium">No gaps detected</p>
                <p className="text-sm">All queries are being answered</p>
              </div>
            ) : (
              <div className="space-y-2">
                {gaps.map((gap) => (
                  <div
                    key={gap._id}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <div className="flex items-center gap-3 p-3 hover:bg-gray-50">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded">
                        {gap.frequency}×
                      </span>
                      <p className="flex-1 text-sm text-gray-700 truncate">
                        {gap.query}
                      </p>
                      <button
                        onClick={() => {
                          if (expandedGapId === gap._id) {
                            setExpandedGapId(null);
                            setGapAnswer('');
                          } else {
                            setExpandedGapId(gap._id);
                            setGapAnswer('');
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Answer
                      </button>
                    </div>

                    {/* Expanded answer form */}
                    {expandedGapId === gap._id && (
                      <div className="p-3 bg-gray-50 border-t border-gray-200">
                        <textarea
                          value={gapAnswer}
                          onChange={(e) => setGapAnswer(e.target.value)}
                          placeholder="Enter the answer for this query..."
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button
                            onClick={() => {
                              setExpandedGapId(null);
                              setGapAnswer('');
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleResolveGap(gap._id)}
                            disabled={isResolvingGap || !gapAnswer.trim()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isResolvingGap && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            Save to KB
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      {deleteDoc && (
        <DeleteModal
          document={deleteDoc}
          onConfirm={handleDelete}
          onCancel={() => setDeleteDoc(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

export default KnowledgeBase;

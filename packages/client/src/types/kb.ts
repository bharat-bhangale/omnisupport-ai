// Knowledge Base Types

export type KBDocumentStatus = 'pending' | 'indexing' | 'indexed' | 'error';

export type KBDocumentType = 'pdf' | 'url' | 'text';

export interface KBDocument {
  _id: string;
  title: string;
  type: KBDocumentType;
  status: KBDocumentStatus;
  chunks: number;
  lastIndexed: string | null;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
  sourceUrl?: string;
  fileSize?: number;
}

export interface KBDocumentsResponse {
  documents: KBDocument[];
  total: number;
}

export interface KBUploadResponse {
  document: KBDocument;
  message: string;
}

export interface KBAddUrlPayload {
  url: string;
  title?: string;
}

export interface KBSearchResult {
  answer: string;
  confidence: number;
  sources: Array<{
    documentId: string;
    documentTitle: string;
    chunkId: string;
    snippet: string;
    relevance: number;
  }>;
}

export interface KBSearchPayload {
  query: string;
  limit?: number;
}

export interface KBGap {
  _id: string;
  query: string;
  frequency: number;
  firstSeen: string;
  lastSeen: string;
  resolved: boolean;
  resolvedAt?: string;
}

export interface KBGapsResponse {
  gaps: KBGap[];
  total: number;
}

export interface KBResolveGapPayload {
  answer: string;
  createDocument?: boolean;
}

export interface KBIndexProgressEvent {
  documentId: string;
  status: KBDocumentStatus;
  progress: number;
  message?: string;
  errorMessage?: string;
}

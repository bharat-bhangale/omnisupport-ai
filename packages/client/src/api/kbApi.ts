import { omnisupportApi } from './omnisupportApi';
import type {
  KBDocument,
  KBDocumentsResponse,
  KBUploadResponse,
  KBAddUrlPayload,
  KBSearchResult,
  KBSearchPayload,
  KBGap,
  KBGapsResponse,
  KBResolveGapPayload,
} from '../types/kb';

export const kbApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get all KB documents
     */
    getKBDocuments: builder.query<KBDocumentsResponse, void>({
      query: () => '/kb/documents',
      providesTags: (result) =>
        result
          ? [
              ...result.documents.map(({ _id }) => ({
                type: 'KnowledgeBase' as const,
                id: _id,
              })),
              { type: 'KnowledgeBase' as const, id: 'LIST' },
            ]
          : [{ type: 'KnowledgeBase' as const, id: 'LIST' }],
    }),

    /**
     * Upload a KB document (PDF file)
     */
    uploadKBDocument: builder.mutation<KBUploadResponse, FormData>({
      query: (formData) => ({
        url: '/kb/documents',
        method: 'POST',
        body: formData,
        formData: true,
      }),
      invalidatesTags: [{ type: 'KnowledgeBase' as const, id: 'LIST' }],
    }),

    /**
     * Add a URL to the knowledge base
     */
    addKBUrl: builder.mutation<KBUploadResponse, KBAddUrlPayload>({
      query: (payload) => ({
        url: '/kb/url',
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: [{ type: 'KnowledgeBase' as const, id: 'LIST' }],
    }),

    /**
     * Delete a KB document
     */
    deleteKBDocument: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/kb/documents/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'KnowledgeBase' as const, id },
        { type: 'KnowledgeBase' as const, id: 'LIST' },
      ],
    }),

    /**
     * Test KB search
     */
    testKBSearch: builder.mutation<KBSearchResult, KBSearchPayload>({
      query: (payload) => ({
        url: '/kb/search',
        method: 'POST',
        body: payload,
      }),
    }),

    /**
     * Get KB gaps (unanswered queries)
     */
    getKBGaps: builder.query<KBGapsResponse, void>({
      query: () => '/kb/gaps',
      providesTags: [{ type: 'KnowledgeBase' as const, id: 'GAPS' }],
    }),

    /**
     * Resolve a KB gap by providing an answer
     */
    resolveKBGap: builder.mutation<
      { success: boolean; gap: KBGap },
      { id: string; data: KBResolveGapPayload }
    >({
      query: ({ id, data }) => ({
        url: `/kb/gaps/${id}/resolve`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'KnowledgeBase' as const, id: 'GAPS' },
        { type: 'KnowledgeBase' as const, id: 'LIST' },
      ],
    }),
  }),
});

/**
 * Update document in cache from socket event
 */
export function updateKBDocumentFromSocket(
  dispatch: ReturnType<typeof kbApi.util.updateQueryData> extends (
    ...args: infer A
  ) => infer R
    ? { (action: R): void }
    : never,
  documentId: string,
  updates: Partial<KBDocument>
): void {
  dispatch(
    kbApi.util.updateQueryData('getKBDocuments', undefined, (draft) => {
      const doc = draft.documents.find((d) => d._id === documentId);
      if (doc) {
        Object.assign(doc, updates);
      }
    })
  );
}

export const {
  useGetKBDocumentsQuery,
  useUploadKBDocumentMutation,
  useAddKBUrlMutation,
  useDeleteKBDocumentMutation,
  useTestKBSearchMutation,
  useGetKBGapsQuery,
  useResolveKBGapMutation,
} = kbApi;

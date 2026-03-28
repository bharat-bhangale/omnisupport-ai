import { omnisupportApi } from './omnisupportApi';
import type {
  Ticket,
  TicketListQuery,
  TicketListResponse,
  ReclassifyResponse,
  ClassificationFeedback,
  SendResponsePayload,
  DraftTone,
  DraftFeedback,
  AIDraft,
  TicketClassifiedEvent,
  TicketDraftReadyEvent,
  TicketUpdatedEvent,
} from '../types/ticket';

export const ticketsApi = omnisupportApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get paginated list of tickets with filters
     */
    getTickets: builder.query<TicketListResponse, TicketListQuery | undefined>({
      query: (params) => {
        const queryParams: Record<string, string | number | boolean> = {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          sortBy: params?.sortBy ?? 'createdAt',
          sortOrder: params?.sortOrder ?? 'desc',
        };

        if (params?.status) {
          queryParams.status = params.status;
        }
        if (params?.priority) {
          queryParams.priority = params.priority;
        }
        if (params?.source) {
          queryParams.source = params.source;
        }
        if (params?.assignedTo) {
          queryParams.assignedTo = params.assignedTo;
        }
        if (params?.customerId) {
          queryParams.customerId = params.customerId;
        }
        if (params?.hasDraft !== undefined) {
          queryParams.hasDraft = params.hasDraft;
        }

        return {
          url: '/tickets',
          params: queryParams,
        };
      },
      providesTags: (result) =>
        result
          ? [
              ...result.tickets.map(({ _id }) => ({ type: 'Tickets' as const, id: _id })),
              { type: 'Tickets' as const, id: 'LIST' },
            ]
          : [{ type: 'Tickets' as const, id: 'LIST' }],
    }),

    /**
     * Get single ticket by ID
     */
    getTicket: builder.query<{ ticket: Ticket }, string>({
      query: (id) => `/tickets/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Ticket' as const, id }],
    }),

    /**
     * Trigger reclassification of a ticket
     */
    reclassifyTicket: builder.mutation<ReclassifyResponse, string>({
      query: (id) => ({
        url: `/tickets/${id}/reclassify`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Ticket' as const, id },
        { type: 'Tickets' as const, id: 'LIST' },
      ],
    }),

    /**
     * Submit classification feedback for a ticket
     */
    submitFeedback: builder.mutation<
      { success: boolean; message: string },
      { id: string; data: ClassificationFeedback }
    >({
      query: ({ id, data }) => ({
        url: `/tickets/${id}/feedback`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Ticket' as const, id }],
    }),

    /**
     * Send/approve a response for a ticket
     */
    sendResponse: builder.mutation<
      { success: boolean; ticket: Ticket },
      { id: string; data: SendResponsePayload }
    >({
      query: ({ id, data }) => ({
        url: `/tickets/${id}/respond`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Ticket' as const, id },
        { type: 'Tickets' as const, id: 'LIST' },
      ],
    }),

    /**
     * Regenerate AI draft with different tone
     */
    regenerateDraft: builder.mutation<
      { draft: AIDraft },
      { id: string; tone: DraftTone }
    >({
      query: ({ id, tone }) => ({
        url: `/tickets/${id}/regenerate-draft`,
        method: 'POST',
        body: { tone },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Ticket' as const, id }],
    }),

    /**
     * Submit feedback on AI draft quality
     */
    submitDraftFeedback: builder.mutation<
      { success: boolean },
      { id: string; data: DraftFeedback }
    >({
      query: ({ id, data }) => ({
        url: `/tickets/${id}/draft-feedback`,
        method: 'POST',
        body: data,
      }),
    }),

    /**
     * Escalate ticket to human agent
     */
    escalateTicket: builder.mutation<
      { success: boolean; ticket: Ticket },
      { id: string; reason: string; notes?: string }
    >({
      query: ({ id, reason, notes }) => ({
        url: `/tickets/${id}/escalate`,
        method: 'POST',
        body: { reason, notes },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Ticket' as const, id },
        { type: 'Tickets' as const, id: 'LIST' },
      ],
    }),

    /**
     * Reassign ticket to another agent
     */
    reassignTicket: builder.mutation<
      { success: boolean; ticket: Ticket },
      { id: string; assignTo: string }
    >({
      query: ({ id, assignTo }) => ({
        url: `/tickets/${id}/reassign`,
        method: 'POST',
        body: { assignTo },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Ticket' as const, id },
        { type: 'Tickets' as const, id: 'LIST' },
      ],
    }),

    /**
     * Close a ticket
     */
    closeTicket: builder.mutation<
      { success: boolean; ticket: Ticket },
      { id: string; resolutionType?: 'ai_resolved' | 'human_resolved' | 'auto_closed' }
    >({
      query: ({ id, resolutionType = 'human_resolved' }) => ({
        url: `/tickets/${id}/close`,
        method: 'POST',
        body: { resolutionType },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Ticket' as const, id },
        { type: 'Tickets' as const, id: 'LIST' },
      ],
    }),

    /**
     * Add a note to a ticket
     */
    addTicketNote: builder.mutation<
      { success: boolean; ticket: Ticket },
      { id: string; note: string }
    >({
      query: ({ id, note }) => ({
        url: `/tickets/${id}/notes`,
        method: 'POST',
        body: { note },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Ticket' as const, id }],
    }),

    /**
     * Get response history for a ticket
     */
    getResponseHistory: builder.query<
      {
        responses: Array<{
          id: string;
          sentAt: string;
          agentId: string;
          agentName: string;
          responseText: string;
          agentEdited: boolean;
          toneApplied: string;
        }>;
      },
      string
    >({
      query: (ticketId) => `/tickets/${ticketId}/response-history`,
      providesTags: (_result, _error, ticketId) => [
        { type: 'Ticket' as const, id: `${ticketId}-history` },
      ],
    }),
  }),
});

/**
 * Update ticket cache from socket events (no refetch)
 */
export function updateTicketFromSocket(
  dispatch: ReturnType<typeof omnisupportApi.util.updateQueryData> extends (
    ...args: infer A
  ) => infer R
    ? { (action: R): void }
    : never,
  event: TicketClassifiedEvent | TicketDraftReadyEvent | TicketUpdatedEvent
): void {
  const { ticketId } = event;

  // Update single ticket cache
  dispatch(
    ticketsApi.util.updateQueryData('getTicket', ticketId, (draft) => {
      if ('classification' in event) {
        // TicketClassifiedEvent
        const classifiedEvent = event as TicketClassifiedEvent;
        draft.ticket.classification = {
          intent: classifiedEvent.classification.category,
          subIntent: classifiedEvent.classification.subCategory,
          confidence: classifiedEvent.classification.confidence,
          categories: [classifiedEvent.classification.category],
        };
        draft.ticket.sentiment = classifiedEvent.classification.sentiment === 'highly_negative'
          ? 'negative'
          : classifiedEvent.classification.sentiment;
        draft.ticket.tags = classifiedEvent.classification.suggestedTags;
      } else if ('draft' in event) {
        // TicketDraftReadyEvent
        const draftEvent = event as TicketDraftReadyEvent;
        draft.ticket.aiDraft = draftEvent.draft;
      } else if ('updates' in event) {
        // TicketUpdatedEvent
        const updatedEvent = event as TicketUpdatedEvent;
        Object.assign(draft.ticket, updatedEvent.updates);
      }
    })
  );

  // Update tickets list cache
  dispatch(
    ticketsApi.util.updateQueryData('getTickets', undefined, (draft) => {
      const ticketIndex = draft.tickets.findIndex((t) => t._id === ticketId);
      if (ticketIndex === -1) return;

      const ticket = draft.tickets[ticketIndex];
      if ('classification' in event) {
        const classifiedEvent = event as TicketClassifiedEvent;
        ticket.classification = {
          intent: classifiedEvent.classification.category,
          subIntent: classifiedEvent.classification.subCategory,
          confidence: classifiedEvent.classification.confidence,
          categories: [classifiedEvent.classification.category],
        };
        ticket.sentiment = classifiedEvent.classification.sentiment === 'highly_negative'
          ? 'negative'
          : classifiedEvent.classification.sentiment;
        ticket.tags = classifiedEvent.classification.suggestedTags;
      } else if ('draft' in event) {
        const draftEvent = event as TicketDraftReadyEvent;
        ticket.aiDraft = draftEvent.draft;
      } else if ('updates' in event) {
        const updatedEvent = event as TicketUpdatedEvent;
        Object.assign(ticket, updatedEvent.updates);
      }
    })
  );
}

export const {
  useGetTicketsQuery,
  useGetTicketQuery,
  useReclassifyTicketMutation,
  useSubmitFeedbackMutation,
  useSendResponseMutation,
  useRegenerateDraftMutation,
  useSubmitDraftFeedbackMutation,
  useEscalateTicketMutation,
  useReassignTicketMutation,
  useCloseTicketMutation,
  useAddTicketNoteMutation,
  useGetResponseHistoryQuery,
} = ticketsApi;

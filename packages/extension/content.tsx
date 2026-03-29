// ============================================================================
// OMNISUPPORT AI - CHROME EXTENSION CONTENT SCRIPT
// ============================================================================
// Detects Zendesk/Freshdesk tickets and injects the OmniSupport panel

import React from 'react';
import { createRoot, Root } from 'react-dom/client';

// ============================================================================
// TYPES
// ============================================================================

interface TicketContext {
  ticket: {
    id: string;
    externalId: string;
    subject: string;
    status: string;
    priority: string;
    createdAt: string;
    updatedAt: string;
    lastMessage: string;
    channel: string;
  };
  aiDraft: {
    content: string;
    confidence: number;
    tone: string;
    sources: Array<{ title: string; confidence: number }>;
    regeneratedCount: number;
  } | null;
  customer: {
    email: string;
    name: string;
    tier: string;
    ltv: number;
    ticketCount: number;
    lastContact: string;
    recentCalls: Array<{ callId: string; date: string; duration: number }>;
  } | null;
  kbRecommendations: Array<{
    id: string;
    title: string;
    excerpt: string;
    confidence: number;
  }>;
}

interface KBSearchResult {
  id: string;
  title: string;
  excerpt: string;
  confidence: number;
  source: string;
}

interface CallHistory {
  callId: string;
  date: string;
  duration: number;
  intent: string;
  sentiment: string;
  summary: string;
}

interface TicketHistory {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
}

// ============================================================================
// TICKET DETECTION
// ============================================================================

function detectZendeskTicketId(): string | null {
  // URL patterns: /agent/tickets/12345, /tickets/12345
  const urlMatch = window.location.pathname.match(/\/tickets\/(\d+)/);
  if (urlMatch) return urlMatch[1];

  // Try DOM selectors
  const ticketHeader = document.querySelector('[data-test-id="ticket-header"] [data-test-id="ticket-id"]');
  if (ticketHeader?.textContent) {
    const match = ticketHeader.textContent.match(/#?(\d+)/);
    if (match) return match[1];
  }

  return null;
}

function detectFreshdeskTicketId(): string | null {
  // URL patterns: /a/tickets/12345, /helpdesk/tickets/12345
  const urlMatch = window.location.pathname.match(/\/tickets\/(\d+)/);
  if (urlMatch) return urlMatch[1];

  // Try DOM selectors
  const ticketId = document.querySelector('.ticket-id');
  if (ticketId?.textContent) {
    const match = ticketId.textContent.match(/#?(\d+)/);
    if (match) return match[1];
  }

  return null;
}

function detectCurrentTicketId(): string | null {
  const host = window.location.hostname;
  
  if (host.includes('zendesk.com')) {
    return detectZendeskTicketId();
  }
  
  if (host.includes('freshdesk.com')) {
    return detectFreshdeskTicketId();
  }
  
  return null;
}

function detectPlatform(): 'zendesk' | 'freshdesk' | null {
  const host = window.location.hostname;
  if (host.includes('zendesk.com')) return 'zendesk';
  if (host.includes('freshdesk.com')) return 'freshdesk';
  return null;
}

// ============================================================================
// API HELPERS
// ============================================================================

async function sendMessage<T>(type: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response as T);
      }
    });
  });
}

// ============================================================================
// PANEL COMPONENTS
// ============================================================================

// Tab Button
function TabButton({ 
  active, 
  onClick, 
  children 
}: { 
  active: boolean; 
  onClick: () => void; 
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
        active 
          ? 'text-teal-600 border-b-2 border-teal-600' 
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

// Draft Tab
function DraftTab({ 
  aiDraft, 
  recentCalls 
}: { 
  aiDraft: TicketContext['aiDraft']; 
  recentCalls?: Array<{ callId: string; date: string; duration: number }>;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (aiDraft?.content) {
      await navigator.clipboard.writeText(aiDraft.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'today';
    if (diff === 1) return 'yesterday';
    return `${diff} days ago`;
  };

  return (
    <div className="p-4 space-y-4">
      {/* Recent Call Banner */}
      {recentCalls && recentCalls.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-600">📞</span>
            <span className="text-sm text-amber-800">
              Customer called {formatDate(recentCalls[0].date)}
            </span>
            <button className="ml-auto text-xs text-amber-600 hover:underline">
              View Transcript
            </button>
          </div>
        </div>
      )}

      {/* AI Draft */}
      {aiDraft ? (
        <>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-purple-600">✨</span>
              <span className="text-sm font-medium text-purple-800">AI Draft</span>
              <span className="ml-auto text-xs text-purple-600">
                {Math.round(aiDraft.confidence * 100)}% confident
              </span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiDraft.content}</p>
          </div>

          <button
            onClick={handleCopy}
            className="w-full py-2 px-4 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
          >
            {copied ? '✓ Copied!' : 'Copy to Clipboard'}
          </button>

          {/* Sources */}
          {aiDraft.sources.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-gray-500">Sources:</span>
              {aiDraft.sources.map((source, idx) => (
                <div key={idx} className="text-xs text-gray-600 flex items-center gap-2">
                  <span>📄</span>
                  <span>{source.title}</span>
                  <span className="ml-auto text-gray-400">{Math.round(source.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <span className="text-3xl">📝</span>
          <p className="mt-2 text-sm">No AI draft available yet</p>
        </div>
      )}
    </div>
  );
}

// KB Search Tab
function KBSearchTab() {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<KBSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await sendMessage<{ results: KBSearchResult[] }>('SEARCH_KB', { query, limit: 5 });
      setResults(res.results || []);
    } catch (error) {
      console.error('KB search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search knowledge base..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? '...' : '🔍'}
        </button>
      </div>

      <div className="space-y-3">
        {results.map((result) => (
          <div key={result.id} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-gray-800">{result.title}</span>
              <span className="ml-auto text-xs text-teal-600">{Math.round(result.confidence * 100)}%</span>
            </div>
            <p className="text-xs text-gray-600">{result.excerpt}</p>
          </div>
        ))}
        {results.length === 0 && !loading && query && (
          <p className="text-center text-sm text-gray-500 py-4">No results found</p>
        )}
      </div>
    </div>
  );
}

// Customer Tab
function CustomerTab({ customer }: { customer: TicketContext['customer'] }) {
  if (!customer) {
    return (
      <div className="p-4 text-center text-gray-500">
        <span className="text-3xl">👤</span>
        <p className="mt-2 text-sm">No customer data available</p>
      </div>
    );
  }

  const tierColors: Record<string, string> = {
    enterprise: 'bg-purple-100 text-purple-800',
    premium: 'bg-blue-100 text-blue-800',
    standard: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="p-4 space-y-4">
      {/* Customer Info */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 font-medium">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-medium text-gray-900">{customer.name}</div>
          <div className="text-xs text-gray-500">{customer.email}</div>
        </div>
        <span className={`ml-auto px-2 py-0.5 text-xs rounded ${tierColors[customer.tier] || tierColors.standard}`}>
          {customer.tier}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-500">Lifetime Value</div>
          <div className="text-lg font-semibold text-gray-900">${customer.ltv.toLocaleString()}</div>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-500">Total Tickets</div>
          <div className="text-lg font-semibold text-gray-900">{customer.ticketCount}</div>
        </div>
      </div>

      {/* Last Contact */}
      <div className="text-xs text-gray-500">
        Last contact: {new Date(customer.lastContact).toLocaleDateString()}
      </div>
    </div>
  );
}

// History Tab
function HistoryTab({ 
  calls, 
  tickets 
}: { 
  calls: CallHistory[]; 
  tickets: TicketHistory[];
}) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="p-4 space-y-4">
      {/* Recent Calls */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Recent Calls</h3>
        {calls.length === 0 ? (
          <p className="text-sm text-gray-400">No recent calls</p>
        ) : (
          <div className="space-y-2">
            {calls.slice(0, 5).map((call) => (
              <div key={call.callId} className="flex items-center gap-2 text-sm">
                <span className="text-teal-600">📞</span>
                <span className="text-gray-700">{call.intent}</span>
                <span className="ml-auto text-xs text-gray-400">{formatDuration(call.duration)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Tickets */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Recent Tickets</h3>
        {tickets.length === 0 ? (
          <p className="text-sm text-gray-400">No recent tickets</p>
        ) : (
          <div className="space-y-2">
            {tickets.slice(0, 5).map((ticket) => (
              <div key={ticket.id} className="flex items-center gap-2 text-sm">
                <span className="text-amber-600">🎫</span>
                <span className="text-gray-700 truncate flex-1">{ticket.subject}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  ticket.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {ticket.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Main Panel Component
function OmniSupportPanel() {
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'draft' | 'kb' | 'customer' | 'history'>('draft');
  const [context, setContext] = React.useState<TicketContext | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  React.useEffect(() => {
    checkAuth();
  }, []);

  React.useEffect(() => {
    if (isAuthenticated) {
      loadContext();
    }
  }, [isAuthenticated]);

  const checkAuth = async () => {
    try {
      const state = await sendMessage<{ isAuthenticated: boolean }>('GET_AUTH_STATE');
      setIsAuthenticated(state.isAuthenticated);
      if (!state.isAuthenticated) {
        setLoading(false);
      }
    } catch {
      setIsAuthenticated(false);
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      await sendMessage('LOGIN');
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const loadContext = async () => {
    const ticketId = detectCurrentTicketId();
    if (!ticketId) {
      setError('No ticket detected');
      setLoading(false);
      return;
    }

    try {
      const data = await sendMessage<TicketContext>('GET_TICKET_CONTEXT', { externalId: ticketId });
      setContext(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load context');
    } finally {
      setLoading(false);
    }
  };

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed right-4 bottom-4 w-12 h-12 bg-teal-600 text-white rounded-full shadow-lg hover:bg-teal-700 flex items-center justify-center z-[9999]"
      >
        <span className="text-xl">✨</span>
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-[380px] bg-white shadow-2xl z-[9999] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-teal-600 text-white">
        <div className="flex items-center gap-2">
          <span className="text-xl">✨</span>
          <span className="font-semibold">OmniSupport AI</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 hover:bg-teal-500 rounded"
          >
            ➖
          </button>
          <button
            onClick={() => {
              const panel = document.getElementById('omnisupport-panel-root');
              panel?.remove();
            }}
            className="p-1 hover:bg-teal-500 rounded"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      {!isAuthenticated ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <span className="text-4xl mb-4">🔐</span>
          <p className="text-gray-600 text-center mb-4">Sign in to access OmniSupport AI</p>
          <button
            onClick={handleLogin}
            className="px-6 py-2 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700"
          >
            Sign In
          </button>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <span className="text-4xl mb-4">⚠️</span>
          <p className="text-gray-600 text-center">{error}</p>
          <button
            onClick={loadContext}
            className="mt-4 px-4 py-2 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <TabButton active={activeTab === 'draft'} onClick={() => setActiveTab('draft')}>
              Draft
            </TabButton>
            <TabButton active={activeTab === 'kb'} onClick={() => setActiveTab('kb')}>
              KB Search
            </TabButton>
            <TabButton active={activeTab === 'customer'} onClick={() => setActiveTab('customer')}>
              Customer
            </TabButton>
            <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
              History
            </TabButton>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'draft' && (
              <DraftTab 
                aiDraft={context?.aiDraft ?? null} 
                recentCalls={context?.customer?.recentCalls}
              />
            )}
            {activeTab === 'kb' && <KBSearchTab />}
            {activeTab === 'customer' && <CustomerTab customer={context?.customer ?? null} />}
            {activeTab === 'history' && (
              <HistoryTab 
                calls={[]} // Would be fetched separately
                tickets={[]} // Would be fetched separately
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// PANEL INJECTION
// ============================================================================

let panelRoot: Root | null = null;

function injectPanel() {
  if (document.getElementById('omnisupport-panel-root')) {
    return; // Already injected
  }

  const container = document.createElement('div');
  container.id = 'omnisupport-panel-root';
  document.body.appendChild(container);

  panelRoot = createRoot(container);
  panelRoot.render(React.createElement(OmniSupportPanel));
}

function removePanel() {
  const container = document.getElementById('omnisupport-panel-root');
  if (container && panelRoot) {
    panelRoot.unmount();
    container.remove();
    panelRoot = null;
  }
}

// ============================================================================
// URL CHANGE DETECTION
// ============================================================================

let currentUrl = window.location.href;

function checkUrlChange() {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    
    const ticketId = detectCurrentTicketId();
    if (ticketId) {
      injectPanel();
    } else {
      removePanel();
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  const platform = detectPlatform();
  if (!platform) {
    console.log('[OmniSupport] Not on a supported platform');
    return;
  }

  console.log(`[OmniSupport] Detected platform: ${platform}`);

  // Check if on a ticket page
  const ticketId = detectCurrentTicketId();
  if (ticketId) {
    console.log(`[OmniSupport] Detected ticket: ${ticketId}`);
    injectPanel();
  }

  // Watch for URL changes (SPA navigation)
  setInterval(checkUrlChange, 1000);
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};

import { useState, useCallback } from 'react';
import {
  Plug,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Settings,
  ExternalLink,
  ArrowRight,
  ArrowLeftRight,
  X,
  Eye,
  EyeOff,
  ChevronRight,
  Loader2,
  Activity,
  Clock,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetIntegrationsQuery,
  useGetIntegrationQuery,
  useConnectIntegrationMutation,
  useTestIntegrationMutation,
  useDisconnectIntegrationMutation,
  useSyncIntegrationMutation,
  type Integration,
} from '../api/integrationsApi';

type CategoryFilter = 'all' | 'helpdesk' | 'crm' | 'communication' | 'storage';

// Integration logos (using placeholder colors for now)
const integrationColors: Record<string, string> = {
  zendesk: 'bg-green-500',
  freshdesk: 'bg-blue-500',
  salesforce: 'bg-sky-500',
  hubspot: 'bg-orange-500',
  slack: 'bg-purple-500',
  intercom: 'bg-indigo-500',
  jira: 'bg-blue-600',
  zapier: 'bg-amber-500',
  sendgrid: 'bg-cyan-500',
};

export default function Integrations() {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectingIntegration, setConnectingIntegration] = useState<string | null>(null);

  const { data, isLoading, refetch } = useGetIntegrationsQuery();

  const categories: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'helpdesk', label: 'Helpdesk' },
    { value: 'crm', label: 'CRM' },
    { value: 'communication', label: 'Communication' },
    { value: 'storage', label: 'Storage' },
  ];

  const filteredIntegrations = data?.integrations.filter(
    (i) => categoryFilter === 'all' || i.category === categoryFilter
  );

  const handleConnect = useCallback((integrationName: string) => {
    setConnectingIntegration(integrationName);
    setConnectModalOpen(true);
  }, []);

  const handleCloseConnectModal = useCallback(() => {
    setConnectModalOpen(false);
    setConnectingIntegration(null);
  }, []);

  const handleSelectIntegration = useCallback((name: string) => {
    setSelectedIntegration(name);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedIntegration(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Plug className="h-8 w-8 text-indigo-600" />
              Integrations
            </h1>
            <p className="mt-1 text-gray-600">
              Connect your favorite tools to enhance your support workflow
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <span className="text-sm text-gray-600">
                <span className="font-semibold text-green-600">{data.stats.active}</span> of{' '}
                {data.stats.total} active
              </span>
            )}
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-gray-200">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                categoryFilter === cat.value
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      )}

      {/* Integration Cards Grid */}
      {!isLoading && filteredIntegrations && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIntegrations.map((integration) => (
            <IntegrationCard
              key={integration.name}
              integration={integration}
              onConnect={handleConnect}
              onSelect={handleSelectIntegration}
            />
          ))}
        </div>
      )}

      {/* Connect Modal */}
      {connectModalOpen && connectingIntegration && (
        <ConnectModal
          integrationName={connectingIntegration}
          onClose={handleCloseConnectModal}
        />
      )}

      {/* Detail Slide-in Panel */}
      {selectedIntegration && (
        <DetailPanel integrationName={selectedIntegration} onClose={handleCloseDetail} />
      )}
    </div>
  );
}

// Integration Card Component
function IntegrationCard({
  integration,
  onConnect,
  onSelect,
}: {
  integration: Integration;
  onConnect: (name: string) => void;
  onSelect: (name: string) => void;
}) {
  const [syncIntegration, { isLoading: isSyncing }] = useSyncIntegrationMutation();

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await syncIntegration(integration.name).unwrap();
      toast.success('Sync queued');
    } catch {
      toast.error('Failed to queue sync');
    }
  };

  const statusConfig = {
    connected: {
      icon: CheckCircle2,
      color: 'text-green-600 bg-green-50',
      label: 'Connected',
    },
    disconnected: {
      icon: XCircle,
      color: 'text-gray-500 bg-gray-50',
      label: 'Disconnected',
    },
    needs_reauth: {
      icon: AlertTriangle,
      color: 'text-amber-600 bg-amber-50',
      label: 'Needs Reauth',
    },
  };

  const status = statusConfig[integration.status];
  const StatusIcon = status.icon;

  return (
    <div
      onClick={() => onSelect(integration.name)}
      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Logo placeholder */}
          <div
            className={`w-12 h-12 rounded-lg ${integrationColors[integration.name] || 'bg-gray-400'} flex items-center justify-center text-white font-bold text-lg`}
          >
            {integration.displayName.charAt(0)}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{integration.displayName}</h3>
            <span className="text-xs text-gray-500 capitalize px-2 py-0.5 bg-gray-100 rounded">
              {integration.category}
            </span>
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {status.label}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{integration.description}</p>

      {/* Data Flow Chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {integration.dataFlows.map((flow) => (
          <span
            key={flow}
            className="flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded"
          >
            {flow === 'webhooks' || flow === 'notifications' || flow === 'emails' ? (
              <ArrowRight className="h-3 w-3" />
            ) : (
              <ArrowLeftRight className="h-3 w-3" />
            )}
            <span className="capitalize">{flow.replace('_', ' ')}</span>
          </span>
        ))}
      </div>

      {/* Actions */}
      {integration.status === 'connected' ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last sync: {integration.lastSync || 'Never'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(integration.name);
              }}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onConnect(integration.name);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Connect
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Connect Modal Component
function ConnectModal({
  integrationName,
  onClose,
}: {
  integrationName: string;
  onClose: () => void;
}) {
  const { data: integration } = useGetIntegrationQuery(integrationName);
  const [connectIntegration, { isLoading }] = useConnectIntegrationMutation();
  const [testIntegration, { isLoading: isTesting }] = useTestIntegrationMutation();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await connectIntegration({ name: integrationName, data: formData }).unwrap();
      toast.success(`${integration?.displayName || integrationName} connected successfully`);
      onClose();
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || 'Connection failed';
      toast.error(message);
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testIntegration(integrationName).unwrap();
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: 'Test request failed' });
    }
  };

  const isSecretField = (field: string) =>
    ['token', 'apiKey', 'apiToken', 'clientSecret', 'accessToken', 'secretKey'].some((s) =>
      field.toLowerCase().includes(s.toLowerCase())
    );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div
              className={`w-12 h-12 rounded-lg ${integrationColors[integrationName] || 'bg-gray-400'} flex items-center justify-center text-white font-bold text-lg`}
            >
              {integration?.displayName?.charAt(0) || integrationName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Connect {integration?.displayName || integrationName}
              </h2>
              <p className="text-sm text-gray-500">Enter your credentials</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {integration?.fields.map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                  {field.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <div className="relative">
                  <input
                    type={isSecretField(field) && !showSecrets[field] ? 'password' : 'text'}
                    value={formData[field] || ''}
                    onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder={`Enter ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                    required
                  />
                  {isSecretField(field) && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowSecrets({ ...showSecrets, [field]: !showSecrets[field] })
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showSecrets[field] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Test Result */}
            {testResult && (
              <div
                className={`p-3 rounded-lg flex items-center gap-2 ${
                  testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {testResult.ok ? (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Connection successful!
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5" />
                    {testResult.error || 'Connection failed'}
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting || Object.keys(formData).length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                Test
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Connect
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Detail Panel Component
function DetailPanel({
  integrationName,
  onClose,
}: {
  integrationName: string;
  onClose: () => void;
}) {
  const { data: integration, isLoading } = useGetIntegrationQuery(integrationName);
  const [testIntegration, { isLoading: isTesting }] = useTestIntegrationMutation();
  const [disconnectIntegration, { isLoading: isDisconnecting }] = useDisconnectIntegrationMutation();
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testIntegration(integrationName).unwrap();
      setTestResult(result);
      if (result.ok) {
        toast.success('Connection healthy');
      } else {
        toast.error(result.error || 'Connection test failed');
      }
    } catch {
      setTestResult({ ok: false, error: 'Test request failed' });
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(`Are you sure you want to disconnect ${integration?.displayName}?`)) {
      return;
    }

    try {
      await disconnectIntegration(integrationName).unwrap();
      toast.success(`${integration?.displayName} disconnected`);
      onClose();
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const healthStatusConfig = {
    healthy: { color: 'text-green-600', bg: 'bg-green-100', label: 'Healthy' },
    degraded: { color: 'text-amber-600', bg: 'bg-amber-100', label: 'Degraded' },
    unhealthy: { color: 'text-red-600', bg: 'bg-red-100', label: 'Unhealthy' },
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* Slide-in Panel */}
      <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Integration Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : integration ? (
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div
                className={`w-16 h-16 rounded-xl ${integrationColors[integrationName] || 'bg-gray-400'} flex items-center justify-center text-white font-bold text-2xl`}
              >
                {integration.displayName.charAt(0)}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">{integration.displayName}</h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    integration.status === 'connected'
                      ? 'text-green-600 bg-green-50'
                      : integration.status === 'needs_reauth'
                        ? 'text-amber-600 bg-amber-50'
                        : 'text-gray-500 bg-gray-50'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {integration.status === 'connected'
                    ? 'Connected'
                    : integration.status === 'needs_reauth'
                      ? 'Needs Reauth'
                      : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* Description */}
            <p className="text-gray-600">{integration.description}</p>

            {/* Credentials */}
            {integration.status === 'connected' && integration.credentials && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Credentials</h4>
                <div className="space-y-2">
                  {Object.entries(integration.credentials).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="font-mono text-gray-700">{value}</span>
                    </div>
                  ))}
                </div>
                <button className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                  <Settings className="h-4 w-4" />
                  Edit Credentials
                </button>
              </div>
            )}

            {/* Sync Configuration */}
            {integration.status === 'connected' && integration.syncConfig && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Sync Configuration</h4>
                <div className="space-y-2">
                  {Object.entries(integration.syncConfig).map(([key, enabled]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enabled}
                          className="sr-only peer"
                          readOnly
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Health Status */}
            {integration.status === 'connected' && integration.health && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Connection Health</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Status</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        healthStatusConfig[integration.health.status]?.bg
                      } ${healthStatusConfig[integration.health.status]?.color}`}
                    >
                      {healthStatusConfig[integration.health.status]?.label}
                    </span>
                  </div>
                  {/* API Usage Bar */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-600">API Usage</span>
                      <span className="text-gray-700">67%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full"
                        style={{ width: '67%' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Test Result */}
            {testResult && (
              <div
                className={`p-3 rounded-lg flex items-center gap-2 ${
                  testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {testResult.ok ? (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Connection successful!
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5" />
                    {testResult.error || 'Connection failed'}
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-4 border-t border-gray-200">
              {integration.status === 'connected' && (
                <>
                  <button
                    onClick={handleTest}
                    disabled={isTesting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Activity className="h-4 w-4" />
                    )}
                    Test Connection
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    {isDisconnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Disconnect
                  </button>
                </>
              )}

              {/* External Link */}
              <a
                href={`https://${integrationName}.com`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-indigo-600 hover:text-indigo-700"
              >
                <ExternalLink className="h-4 w-4" />
                View {integration.displayName} Documentation
              </a>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">Integration not found</div>
        )}
      </div>
    </div>
  );
}

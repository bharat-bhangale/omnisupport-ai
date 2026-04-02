import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Building2,
  Users,
  CreditCard,
  Shield,
  Upload,
  Loader2,
  Check,
  X,
  Mail,
  Copy,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Download,
  Key,
  Clock,
  Database,
  UserPlus,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetCompanyProfileQuery,
  useUpdateCompanyProfileMutation,
  useUploadCompanyLogoMutation,
  useGetTeamMembersQuery,
  useInviteTeamMemberMutation,
  useUpdateMemberRoleMutation,
  useRemoveTeamMemberMutation,
  useGetBillingInfoQuery,
  useCreateBillingPortalMutation,
  useGetApiKeysQuery,
  useRegenerateApiKeysMutation,
  useUpdateSecurityMutation,
  useRequestDataExportMutation,
  type TeamMember,
} from '../api/settingsApi';

// Tab types
type TabId = 'company' | 'team' | 'billing' | 'security';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'company', label: 'Company Profile', icon: <Building2 className="w-4 h-4" /> },
  { id: 'team', label: 'Team Members', icon: <Users className="w-4 h-4" /> },
  { id: 'billing', label: 'Plan & Billing', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'security', label: 'Security & API', icon: <Shield className="w-4 h-4" /> },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
];

const SESSION_TIMEOUTS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 480, label: '8 hours' },
];

const RETENTION_PERIODS = [
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
];

// Usage bar component
function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}): React.ReactElement {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = percentage < 75 ? 'bg-green-500' : percentage < 90 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-[#9CA3AF]">{label}</span>
        <span className="text-[#F9FAFB] font-medium">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 bg-[#1E3461] rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Role badge component
function RoleBadge({ role }: { role: string }): React.ReactElement {
  const config = {
    admin: 'bg-purple-900/50 text-purple-400',
    manager: 'bg-blue-900/50 text-blue-400',
    agent: 'bg-[#1E3461] text-[#9CA3AF]',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${config[role as keyof typeof config] || config.agent}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }): React.ReactElement {
  const config = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    past_due: 'bg-red-100 text-red-700',
    paid: 'bg-green-100 text-green-700',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${config[status as keyof typeof config] || 'bg-[#1E3461] text-[#9CA3AF]'}`}>
      {status.replace('_', ' ').charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// Invite modal component
function InviteModal({
  onClose,
  onInvite,
  isLoading,
}: {
  onClose: () => void;
  onInvite: (email: string, role: 'agent' | 'manager') => void;
  isLoading: boolean;
}): React.ReactElement {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'agent' | 'manager'>('agent');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[#162240] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#F9FAFB]">Invite Team Member</h3>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#9CA3AF]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#F9FAFB] mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] placeholder-[#6B7280] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#F9FAFB] mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'agent' | 'manager')}
              className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
            >
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-[#F9FAFB] bg-[#1E3461] rounded-lg hover:bg-[#0F1F3D]"
          >
            Cancel
          </button>
          <button
            onClick={() => onInvite(email, role)}
            disabled={isLoading || !email}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Send Invite
          </button>
        </div>
      </div>
    </div>
  );
}

// Confirmation modal
function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
  isLoading,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}): React.ReactElement {
  const confirmClass =
    confirmVariant === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[#162240] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-full ${confirmVariant === 'danger' ? 'bg-red-900/50' : 'bg-blue-900/50'}`}>
            <AlertTriangle className={`w-5 h-5 ${confirmVariant === 'danger' ? 'text-red-400' : 'text-blue-400'}`} />
          </div>
          <h3 className="text-lg font-semibold text-[#F9FAFB]">{title}</h3>
        </div>
        <p className="text-[#9CA3AF] mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-[#F9FAFB] bg-[#1E3461] rounded-lg hover:bg-[#0F1F3D]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${confirmClass} disabled:opacity-50 flex items-center gap-2`}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Settings(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('company');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [newApiKeys, setNewApiKeys] = useState<{ secretKey?: string; webhookSecret?: string } | null>(null);

  // Company form state
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [primaryLanguage, setPrimaryLanguage] = useState('en');
  const [hasCompanyChanges, setHasCompanyChanges] = useState(false);

  // Security form state
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(480);
  const [dataRetention, setDataRetention] = useState(90);

  // RTK Query hooks
  const { data: companyData, isLoading: isLoadingCompany } = useGetCompanyProfileQuery();
  const { data: teamData, isLoading: isLoadingTeam } = useGetTeamMembersQuery();
  const { data: billingData, isLoading: isLoadingBilling } = useGetBillingInfoQuery();
  const { data: apiKeysData, isLoading: isLoadingApiKeys } = useGetApiKeysQuery();

  const [updateCompany, { isLoading: isUpdatingCompany }] = useUpdateCompanyProfileMutation();
  const [uploadLogo, { isLoading: isUploadingLogo }] = useUploadCompanyLogoMutation();
  const [inviteMember, { isLoading: isInviting }] = useInviteTeamMemberMutation();
  const [updateRole] = useUpdateMemberRoleMutation();
  const [removeMember, { isLoading: isRemoving }] = useRemoveTeamMemberMutation();
  const [createPortal, { isLoading: isCreatingPortal }] = useCreateBillingPortalMutation();
  const [regenerateKeys, { isLoading: isRegenerating }] = useRegenerateApiKeysMutation();
  const [updateSecurity, { isLoading: isUpdatingSecurity }] = useUpdateSecurityMutation();
  const [requestExport, { isLoading: isExporting }] = useRequestDataExportMutation();

  // Initialize company form from data
  React.useEffect(() => {
    if (companyData?.company) {
      setCompanyName(companyData.company.name);
      setIndustry(companyData.company.industry || '');
      setTimezone(companyData.company.timezone || 'UTC');
      setPrimaryLanguage(companyData.company.primaryLanguage || 'en');
    }
  }, [companyData]);

  // Logo dropzone
  const onLogoDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const formData = new FormData();
      formData.append('logo', acceptedFiles[0]);

      try {
        await uploadLogo(formData).unwrap();
        toast.success('Logo updated');
      } catch {
        toast.error('Failed to upload logo');
      }
    },
    [uploadLogo]
  );

  const { getRootProps: getLogoRootProps, getInputProps: getLogoInputProps, isDragActive: isLogoDragActive } = useDropzone({
    onDrop: onLogoDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif'] },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
    disabled: isUploadingLogo,
  });

  // Handlers
  const handleSaveCompany = async () => {
    try {
      await updateCompany({
        name: companyName,
        industry,
        timezone,
        primaryLanguage,
      }).unwrap();
      toast.success('Company profile saved');
      setHasCompanyChanges(false);
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleInvite = async (email: string, role: 'agent' | 'manager') => {
    try {
      await inviteMember({ email, role }).unwrap();
      toast.success('Invitation sent');
      setShowInviteModal(false);
    } catch {
      toast.error('Failed to send invitation');
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
      await removeMember(memberToRemove.id).unwrap();
      toast.success('Member removed');
      setMemberToRemove(null);
    } catch {
      toast.error('Failed to remove member');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateRole({ userId, role: newRole }).unwrap();
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    }
  };

  const handleManagePlan = async () => {
    try {
      const result = await createPortal().unwrap();
      window.location.href = result.url;
    } catch {
      toast.error('Failed to open billing portal');
    }
  };

  const handleRegenerateKeys = async () => {
    try {
      const result = await regenerateKeys().unwrap();
      setNewApiKeys({
        secretKey: result.apiKeys.secretKey,
        webhookSecret: result.apiKeys.webhookSecret || undefined,
      });
      setShowRegenerateConfirm(false);
      toast.success('API keys regenerated');
    } catch {
      toast.error('Failed to regenerate keys');
    }
  };

  const handleSaveSecurity = async () => {
    try {
      await updateSecurity({
        twoFactorRequired,
        sessionTimeoutMinutes: sessionTimeout,
        dataRetentionDays: dataRetention,
      }).unwrap();
      toast.success('Security settings saved');
    } catch {
      toast.error('Failed to save security settings');
    }
  };

  const handleExportData = async () => {
    try {
      await requestExport().unwrap();
      toast.success('Data export initiated. You will receive an email when ready.');
    } catch {
      toast.error('Failed to start data export');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="min-h-screen bg-[#0A1835]">
      {/* Header */}
      <div className="bg-[#162240] border-b border-[#1E3461] px-6 py-4">
        <h1 className="text-2xl font-semibold text-[#F9FAFB]">Settings</h1>
        <p className="text-sm text-[#9CA3AF] mt-1">
          Manage your company, team, and billing
        </p>
      </div>

      {/* Content with left nav */}
      <div className="flex">
        {/* Left navigation */}
        <div className="w-52 min-h-[calc(100vh-80px)] bg-[#0F1F3D] border-r border-[#1E3461] p-4">
          <nav className="space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-900/50 text-blue-400'
                    : 'text-[#9CA3AF] hover:bg-[#1E3461]'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 p-6">
          {/* Company Profile */}
          {activeTab === 'company' && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <h2 className="text-lg font-semibold text-[#F9FAFB] mb-6">Company Profile</h2>

                {isLoadingCompany ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[#6B7280]" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Logo */}
                    <div>
                      <label className="block text-sm font-medium text-[#F9FAFB] mb-2">
                        Company Logo
                      </label>
                      <div className="flex items-center gap-4">
                        <div
                          {...getLogoRootProps()}
                          className={`w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors ${
                            isLogoDragActive
                              ? 'border-blue-500 bg-blue-900/20'
                              : 'border-[#1E3461] hover:border-[#3B82F6]'
                          }`}
                        >
                          <input {...getLogoInputProps()} />
                          {companyData?.company.logoUrl ? (
                            <img
                              src={companyData.company.logoUrl}
                              alt="Logo"
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : isUploadingLogo ? (
                            <Loader2 className="w-6 h-6 animate-spin text-[#6B7280]" />
                          ) : (
                            <Upload className="w-6 h-6 text-[#6B7280]" />
                          )}
                        </div>
                        <button
                          {...getLogoRootProps()}
                          className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                        >
                          Change Logo
                        </button>
                      </div>
                    </div>

                    {/* Fields */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-[#F9FAFB] mb-1">
                          Company Name
                        </label>
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e) => {
                            setCompanyName(e.target.value);
                            setHasCompanyChanges(true);
                          }}
                          className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[#F9FAFB] mb-1">
                          Industry
                        </label>
                        <input
                          type="text"
                          value={industry}
                          onChange={(e) => {
                            setIndustry(e.target.value);
                            setHasCompanyChanges(true);
                          }}
                          placeholder="e.g., SaaS, E-commerce"
                          className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] placeholder-[#6B7280] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[#F9FAFB] mb-1">
                          Timezone
                        </label>
                        <select
                          value={timezone}
                          onChange={(e) => {
                            setTimezone(e.target.value);
                            setHasCompanyChanges(true);
                          }}
                          className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
                        >
                          {TIMEZONES.map((tz) => (
                            <option key={tz} value={tz}>
                              {tz}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[#F9FAFB] mb-1">
                          Primary Language
                        </label>
                        <select
                          value={primaryLanguage}
                          onChange={(e) => {
                            setPrimaryLanguage(e.target.value);
                            setHasCompanyChanges(true);
                          }}
                          className="w-full px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
                        >
                          {LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                              {lang.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        onClick={handleSaveCompany}
                        disabled={isUpdatingCompany || !hasCompanyChanges}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {isUpdatingCompany && <Loader2 className="w-4 h-4 animate-spin" />}
                        Save Changes
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Team Members */}
          {activeTab === 'team' && (
            <div className="space-y-6">
              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-[#F9FAFB]">
                    Team ({teamData?.total || 0} members)
                  </h2>
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    <UserPlus className="w-4 h-4" />
                    Invite Member
                  </button>
                </div>

                {isLoadingTeam ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[#6B7280]" />
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-[#0F1F3D] border-b border-[#1E3461]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#9CA3AF] uppercase">
                          Member
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#9CA3AF] uppercase">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#9CA3AF] uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#9CA3AF] uppercase">
                          Last Active
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-[#9CA3AF] uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E3461]">
                      {teamData?.members.map((member) => (
                        <tr key={member.id} className="hover:bg-[#0F1F3D]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}`}
                                alt={member.name}
                                className="w-8 h-8 rounded-full"
                              />
                              <div>
                                <p className="font-medium text-[#F9FAFB]">{member.name}</p>
                                <p className="text-sm text-[#9CA3AF]">{member.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.id, e.target.value)}
                              className="text-sm bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] rounded px-2 py-1"
                            >
                              <option value="agent">Agent</option>
                              <option value="manager">Manager</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={member.status} />
                          </td>
                          <td className="px-4 py-3 text-sm text-[#9CA3AF]">
                            {member.lastActive
                              ? new Date(member.lastActive).toLocaleDateString()
                              : 'Never'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setMemberToRemove(member)}
                              className="p-1.5 text-[#6B7280] hover:text-red-400 hover:bg-red-900/30 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Plan & Billing */}
          {activeTab === 'billing' && (
            <div className="max-w-3xl space-y-6">
              {isLoadingBilling ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-[#6B7280]" />
                </div>
              ) : (
                <>
                  {/* Current Plan */}
                  <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-[#F9FAFB]">Current Plan</h2>
                        <p className="text-2xl font-bold text-[#F9FAFB] mt-1">
                          {billingData?.billing.plan.charAt(0).toUpperCase() + billingData?.billing.plan.slice(1)}
                        </p>
                        {billingData?.billing.nextChargeDate && (
                          <p className="text-sm text-[#9CA3AF] mt-1">
                            Renews on {new Date(billingData.billing.nextChargeDate).toLocaleDateString()}
                            {billingData.billing.nextChargeAmount && (
                              <> · ${billingData.billing.nextChargeAmount}/month</>
                            )}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={handleManagePlan}
                        disabled={isCreatingPortal}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isCreatingPortal ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ExternalLink className="w-4 h-4" />
                        )}
                        Manage Plan
                      </button>
                    </div>
                  </div>

                  {/* Usage */}
                  <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                    <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Usage This Period</h2>
                    <div className="space-y-4">
                      <UsageBar
                        label="Voice Minutes"
                        used={billingData?.billing.usage.minutes.used || 0}
                        limit={billingData?.billing.usage.minutes.limit || 100}
                      />
                      <UsageBar
                        label="Tickets Processed"
                        used={billingData?.billing.usage.tickets.used || 0}
                        limit={billingData?.billing.usage.tickets.limit || 500}
                      />
                    </div>
                  </div>

                  {/* Payment Method */}
                  {billingData?.billing.paymentMethod && (
                    <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                      <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Payment Method</h2>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-8 bg-[#0F1F3D] rounded flex items-center justify-center text-xs font-bold text-[#9CA3AF]">
                            {billingData.billing.paymentMethod.brand?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-[#F9FAFB]">
                              •••• {billingData.billing.paymentMethod.last4}
                            </p>
                            <p className="text-sm text-[#9CA3AF]">
                              Expires {billingData.billing.paymentMethod.expMonth}/{billingData.billing.paymentMethod.expYear}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={handleManagePlan}
                          className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Invoices */}
                  <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                    <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Recent Invoices</h2>
                    {billingData?.billing.invoices.length === 0 ? (
                      <p className="text-[#9CA3AF]">No invoices yet</p>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-[#0F1F3D] border-b border-[#1E3461]">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-[#9CA3AF]">
                              Date
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-[#9CA3AF]">
                              Amount
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-[#9CA3AF]">
                              Status
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-[#9CA3AF]">
                              Download
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E3461]">
                          {billingData?.billing.invoices.map((invoice) => (
                            <tr key={invoice.id}>
                              <td className="px-4 py-2 text-sm text-[#F9FAFB]">
                                {new Date(invoice.date).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-2 text-sm text-[#F9FAFB]">
                                ${invoice.amount.toFixed(2)}
                              </td>
                              <td className="px-4 py-2">
                                <StatusBadge status={invoice.status} />
                              </td>
                              <td className="px-4 py-2 text-right">
                                {invoice.pdfUrl && (
                                  <a
                                    href={invoice.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300"
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Security & API */}
          {activeTab === 'security' && (
            <div className="max-w-2xl space-y-6">
              {/* API Keys */}
              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">API Keys</h2>

                {newApiKeys && (
                  <div className="mb-4 p-4 bg-green-900/30 border border-green-700 rounded-lg">
                    <p className="text-sm font-medium text-green-400 mb-2">
                      ⚠️ Save these keys now - they will not be shown again!
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#9CA3AF]">Secret Key:</span>
                        <code className="text-sm bg-[#0A1835] text-[#F9FAFB] px-2 py-1 rounded">{newApiKeys.secretKey}</code>
                        <button
                          onClick={() => copyToClipboard(newApiKeys.secretKey!)}
                          className="p-1 text-[#6B7280] hover:text-[#9CA3AF]"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      {newApiKeys.webhookSecret && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#9CA3AF]">Webhook Secret:</span>
                          <code className="text-sm bg-[#0A1835] text-[#F9FAFB] px-2 py-1 rounded">{newApiKeys.webhookSecret}</code>
                          <button
                            onClick={() => copyToClipboard(newApiKeys.webhookSecret!)}
                            className="p-1 text-[#6B7280] hover:text-[#9CA3AF]"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isLoadingApiKeys ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#6B7280]" />
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-[#0F1F3D] rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-[#F9FAFB]">API Key</p>
                        <code className="text-sm text-[#9CA3AF]">
                          {apiKeysData?.apiKeys.publicKey || 'Not generated'}
                        </code>
                      </div>
                      <div className="flex items-center gap-2">
                        {apiKeysData?.apiKeys.publicKey && (
                          <button
                            onClick={() => copyToClipboard(apiKeysData.apiKeys.publicKey!)}
                            className="p-2 text-[#6B7280] hover:text-[#9CA3AF] hover:bg-[#1E3461] rounded"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-[#0F1F3D] rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-[#F9FAFB]">Webhook Secret</p>
                        <code className="text-sm text-[#9CA3AF]">
                          {apiKeysData?.apiKeys.webhookSecret || 'Not generated'}
                        </code>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowRegenerateConfirm(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#F9FAFB] bg-[#1E3461] rounded-lg hover:bg-[#0F1F3D]"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Regenerate Keys
                    </button>
                  </div>
                )}
              </div>

              {/* Security Settings */}
              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <h2 className="text-lg font-semibold text-[#F9FAFB] mb-4">Security Settings</h2>

                <div className="space-y-6">
                  {/* 2FA Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[#F9FAFB]">Require Two-Factor Authentication</p>
                      <p className="text-sm text-[#9CA3AF]">Require all team members to enable 2FA</p>
                    </div>
                    <button
                      onClick={() => setTwoFactorRequired(!twoFactorRequired)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        twoFactorRequired ? 'bg-blue-600' : 'bg-[#1E3461]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          twoFactorRequired ? 'translate-x-6' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {/* Session Timeout */}
                  <div>
                    <label className="block text-sm font-medium text-[#F9FAFB] mb-1">
                      Session Timeout
                    </label>
                    <select
                      value={sessionTimeout}
                      onChange={(e) => setSessionTimeout(Number(e.target.value))}
                      className="w-48 px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
                    >
                      {SESSION_TIMEOUTS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Data Retention */}
                  <div>
                    <label className="block text-sm font-medium text-[#F9FAFB] mb-1">
                      Call Recordings Retention
                    </label>
                    <select
                      value={dataRetention}
                      onChange={(e) => setDataRetention(Number(e.target.value))}
                      className="w-48 px-3 py-2 bg-[#0A1835] border border-[#1E3461] text-[#F9FAFB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6]"
                    >
                      {RETENTION_PERIODS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleSaveSecurity}
                    disabled={isUpdatingSecurity}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isUpdatingSecurity && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Security Settings
                  </button>
                </div>
              </div>

              {/* GDPR Export */}
              <div className="bg-[#162240] rounded-lg shadow-sm border border-[#1E3461] p-6">
                <h2 className="text-lg font-semibold text-[#F9FAFB] mb-2">Data Export</h2>
                <p className="text-sm text-[#9CA3AF] mb-4">
                  Export all your company data for compliance or backup purposes.
                </p>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#F9FAFB] bg-[#1E3461] rounded-lg hover:bg-[#0F1F3D] disabled:opacity-50"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Database className="w-4 h-4" />
                  )}
                  Export All Data (GDPR)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onInvite={handleInvite}
          isLoading={isInviting}
        />
      )}

      {memberToRemove && (
        <ConfirmModal
          title="Remove Team Member"
          message={`Are you sure you want to remove ${memberToRemove.name}? They will lose access to the platform.`}
          confirmLabel="Remove"
          onConfirm={handleRemoveMember}
          onCancel={() => setMemberToRemove(null)}
          isLoading={isRemoving}
        />
      )}

      {showRegenerateConfirm && (
        <ConfirmModal
          title="Regenerate API Keys"
          message="This will invalidate your existing API keys. Any integrations using the old keys will stop working."
          confirmLabel="Regenerate"
          confirmVariant="primary"
          onConfirm={handleRegenerateKeys}
          onCancel={() => setShowRegenerateConfirm(false)}
          isLoading={isRegenerating}
        />
      )}
    </div>
  );
}

export default Settings;

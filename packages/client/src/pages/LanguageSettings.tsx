// ============================================================================
// LANGUAGE SETTINGS PAGE
// ============================================================================
// Settings page for configuring multilingual support

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  useGetSupportedLanguagesQuery,
  useGetKBCoverageQuery,
  useGetLanguageConfigQuery,
  useUpdateLanguageConfigMutation,
  SUPPORTED_LANGUAGES,
  LANGUAGE_FLAGS,
} from '../api/languagesApi';

type Tab = 'supported' | 'coverage';

export function LanguageSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('supported');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [autoDetect, setAutoDetect] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  // RTK Query hooks
  const { data: supportedData } = useGetSupportedLanguagesQuery();
  const { data: coverageData, refetch: refetchCoverage } = useGetKBCoverageQuery();
  const { data: configData, isLoading: isConfigLoading } = useGetLanguageConfigQuery();
  const [updateConfig, { isLoading: isUpdating }] = useUpdateLanguageConfigMutation();

  // Initialize from config
  useMemo(() => {
    if (configData && !isDirty) {
      setSelectedLanguages(configData.supportedLanguages || ['en']);
      setAutoDetect(configData.autoDetect ?? true);
    }
  }, [configData, isDirty]);

  // All 23 supported languages
  const allLanguages = Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
    code,
    name,
    flag: LANGUAGE_FLAGS[code] || '🌐',
  }));

  // Toggle language selection
  const toggleLanguage = (code: string) => {
    // Cannot disable English (default fallback)
    if (code === 'en' && selectedLanguages.includes('en')) {
      return;
    }
    setSelectedLanguages((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code]
    );
    setIsDirty(true);
  };

  // Save settings
  const handleSave = async () => {
    try {
      await updateConfig({
        supportedLanguages: selectedLanguages,
        autoDetect,
      }).unwrap();
      setIsDirty(false);
      refetchCoverage();
    } catch (err) {
      console.error('Failed to save language settings:', err);
    }
  };

  // Get coverage status for a language
  const getCoverageInfo = (code: string) => {
    const lang = coverageData?.coverage?.find((c) => c.code === code);
    return lang?.documentCount || 0;
  };

  // Get coverage status badge
  const getCoverageStatus = (count: number) => {
    if (count >= 50) {
      return {
        label: 'Excellent',
        className: 'bg-emerald-500/20 text-emerald-400',
      };
    }
    if (count >= 10) {
      return {
        label: 'Good',
        className: 'bg-amber-500/20 text-amber-400',
      };
    }
    if (count > 0) {
      return {
        label: 'Minimal',
        className: 'bg-red-500/20 text-red-400',
      };
    }
    return {
      label: 'None',
      className: 'bg-slate-500/20 text-slate-500',
    };
  };

  if (isConfigLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Language Settings</h1>
          <p className="text-slate-400 mt-1">
            Configure multilingual support for voice and text channels
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || isUpdating}
          className={`
            px-4 py-2 rounded-lg font-medium transition
            ${isDirty
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-slate-700 text-slate-400 cursor-not-allowed'}
          `}
        >
          {isUpdating ? 'Saving...' : 'Save Language Settings'}
        </button>
      </div>

      {/* Auto-detect toggle */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-medium">Automatic Language Detection</h3>
            <p className="text-slate-400 text-sm mt-1">
              Detect customer's language from first message and respond accordingly
            </p>
          </div>
          <button
            onClick={() => {
              setAutoDetect(!autoDetect);
              setIsDirty(true);
            }}
            className={`
              relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full 
              border-2 border-transparent transition-colors duration-200 ease-in-out
              ${autoDetect ? 'bg-blue-600' : 'bg-slate-600'}
            `}
          >
            <span
              className={`
                pointer-events-none inline-block h-5 w-5 transform rounded-full 
                bg-white shadow ring-0 transition duration-200 ease-in-out
                ${autoDetect ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button
          onClick={() => setActiveTab('supported')}
          className={`
            px-4 py-2 rounded-lg font-medium transition
            ${activeTab === 'supported'
              ? 'bg-blue-600/20 text-blue-400'
              : 'text-slate-400 hover:text-white'}
          `}
        >
          Supported Languages
        </button>
        <button
          onClick={() => setActiveTab('coverage')}
          className={`
            px-4 py-2 rounded-lg font-medium transition
            ${activeTab === 'coverage'
              ? 'bg-blue-600/20 text-blue-400'
              : 'text-slate-400 hover:text-white'}
          `}
        >
          KB Coverage
        </button>
      </div>

      {/* SUPPORTED LANGUAGES TAB */}
      {activeTab === 'supported' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {allLanguages.map(({ code, name, flag }) => {
              const isSelected = selectedLanguages.includes(code);
              const docCount = getCoverageInfo(code);
              const isEnglish = code === 'en';

              return (
                <div
                  key={code}
                  onClick={() => toggleLanguage(code)}
                  className={`
                    relative p-4 rounded-xl border cursor-pointer transition
                    ${isSelected
                      ? 'bg-blue-500/10 border-blue-500/50'
                      : 'bg-slate-800 border-slate-700 hover:border-slate-500'}
                    ${isEnglish && isSelected ? 'cursor-not-allowed' : ''}
                  `}
                >
                  {/* Toggle indicator */}
                  <div
                    className={`
                      absolute top-3 right-3 w-5 h-5 rounded-full border-2 transition
                      ${isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : 'bg-transparent border-slate-500'}
                    `}
                  >
                    {isSelected && (
                      <svg
                        className="w-full h-full text-white p-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Language info */}
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{flag}</span>
                    <div>
                      <div className="text-white font-medium">{name}</div>
                      <div className="text-slate-500 text-xs uppercase">{code}</div>
                    </div>
                  </div>

                  {/* KB coverage indicator */}
                  <div className="mt-3 text-xs text-slate-400">
                    {docCount > 0 ? (
                      <span className="text-emerald-400">{docCount} docs</span>
                    ) : (
                      <span>No docs yet</span>
                    )}
                  </div>

                  {/* Primary badge for English */}
                  {isEnglish && (
                    <div className="absolute bottom-3 right-3">
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded">
                        Primary
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected summary */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <p className="text-slate-400 text-sm">
              <span className="text-white font-medium">
                {selectedLanguages.length} languages
              </span>{' '}
              enabled for customer support.{' '}
              {autoDetect
                ? 'Language will be auto-detected from customer messages.'
                : 'Responses will use company primary language.'}
            </p>
          </div>
        </div>
      )}

      {/* KB COVERAGE TAB */}
      {activeTab === 'coverage' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/80 border-b border-slate-700">
              <tr>
                <th className="text-left text-slate-400 text-xs uppercase tracking-wider px-4 py-3">
                  Language
                </th>
                <th className="text-right text-slate-400 text-xs uppercase tracking-wider px-4 py-3">
                  Documents
                </th>
                <th className="text-center text-slate-400 text-xs uppercase tracking-wider px-4 py-3">
                  Status
                </th>
                <th className="text-right text-slate-400 text-xs uppercase tracking-wider px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {allLanguages
                .filter((lang) => selectedLanguages.includes(lang.code))
                .map(({ code, name, flag }) => {
                  const docCount = getCoverageInfo(code);
                  const status = getCoverageStatus(docCount);

                  return (
                    <tr key={code} className="hover:bg-slate-700/30 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{flag}</span>
                          <div>
                            <div className="text-white font-medium">{name}</div>
                            <div className="text-slate-500 text-xs">{code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-white font-mono">{docCount}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`
                            inline-block px-2 py-1 rounded-full text-xs font-medium
                            ${status.className}
                          `}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/settings/knowledge-base?lang=${code}`}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          Upload {name} docs
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>

          {selectedLanguages.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              No languages selected. Enable languages in the Supported Languages tab.
            </div>
          )}
        </div>
      )}

      {/* Info card */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-white font-medium mb-2">📚 Multilingual Knowledge Base</h3>
        <p className="text-slate-400 text-sm">
          For best results, upload knowledge base documents in each supported language.
          When a customer speaks a language without KB content, the system will
          fall back to English documents and translate responses.
        </p>
      </div>
    </div>
  );
}

export default LanguageSettings;

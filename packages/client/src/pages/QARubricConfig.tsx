import { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  RotateCcw,
  Play,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Target,
  Lightbulb,
  ArrowUpDown,
  Smile,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetQARubricQuery,
  useUpdateQARubricMutation,
  useTestQARubricBatchMutation,
  type QARubricDimension,
} from '../api/qaApi';

// Default rubric configuration
const DEFAULT_RUBRIC: QARubricDimension[] = [
  {
    name: 'Intent Understanding',
    key: 'intentUnderstanding',
    weight: 20,
    minPassScore: 6,
    scoringGuide:
      'Score based on how accurately the AI identified the customer\'s true intent and underlying needs. Consider: Was the core problem understood? Were follow-up questions appropriate?',
  },
  {
    name: 'Response Accuracy',
    key: 'responseAccuracy',
    weight: 25,
    minPassScore: 7,
    scoringGuide:
      'Score based on factual correctness and relevance of information provided. Consider: Were facts accurate? Was the response complete? Did it address the specific question?',
  },
  {
    name: 'Resolution Success',
    key: 'resolutionSuccess',
    weight: 25,
    minPassScore: 6,
    scoringGuide:
      'Score based on whether the AI successfully resolved the issue or made meaningful progress. Consider: Was the problem solved? Were actionable next steps provided?',
  },
  {
    name: 'Escalation Correctness',
    key: 'escalationCorrectness',
    weight: 15,
    minPassScore: 7,
    scoringGuide:
      'Score based on appropriate escalation decisions. Consider: Did the AI correctly identify when to escalate? Was human handoff triggered at the right time?',
  },
  {
    name: 'Customer Experience',
    key: 'customerExperience',
    weight: 15,
    minPassScore: 6,
    scoringGuide:
      'Score based on overall tone, empathy, and professionalism. Consider: Was the AI friendly and helpful? Did it acknowledge customer frustration appropriately?',
  },
];

// Dimension icons
const dimensionIcons: Record<string, React.ReactNode> = {
  intentUnderstanding: <Target className="h-5 w-5" />,
  responseAccuracy: <CheckCircle2 className="h-5 w-5" />,
  resolutionSuccess: <Lightbulb className="h-5 w-5" />,
  escalationCorrectness: <ArrowUpDown className="h-5 w-5" />,
  customerExperience: <Smile className="h-5 w-5" />,
};

export default function QARubricConfig() {
  const { data: rubricData, isLoading: isLoadingRubric } = useGetQARubricQuery();
  const [updateRubric, { isLoading: isUpdating }] = useUpdateQARubricMutation();
  const [testRubric, { isLoading: isTesting }] = useTestQARubricBatchMutation();

  // Local state for editing
  const [dimensions, setDimensions] = useState<QARubricDimension[]>(DEFAULT_RUBRIC);
  const [hasChanges, setHasChanges] = useState(false);
  const [testResults, setTestResults] = useState<
    { interactionId: string; overallScore: number; passed: number; failed: number }[] | null
  >(null);

  // Load rubric data into local state
  useEffect(() => {
    if (rubricData?.rubric) {
      setDimensions(rubricData.rubric.dimensions);
      setHasChanges(false);
    }
  }, [rubricData]);

  // Calculate total weight
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const isWeightValid = totalWeight === 100;

  // Update dimension
  const updateDimension = (key: string, updates: Partial<QARubricDimension>) => {
    setDimensions((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...updates } : d))
    );
    setHasChanges(true);
  };

  // Reset to defaults
  const handleResetToDefaults = () => {
    setDimensions(DEFAULT_RUBRIC);
    setHasChanges(true);
  };

  // Save rubric
  const handleSave = async () => {
    if (!isWeightValid) {
      toast.error('Weights must sum to 100%');
      return;
    }

    try {
      await updateRubric({
        dimensions: dimensions.map(({ weight, minPassScore, scoringGuide }) => ({
          weight,
          minPassScore,
          scoringGuide,
        })),
      }).unwrap();
      toast.success('Rubric saved successfully');
      setHasChanges(false);
    } catch {
      toast.error('Failed to save rubric');
    }
  };

  // Test rubric
  const handleTest = async () => {
    try {
      const results = await testRubric({ count: 10 }).unwrap();
      setTestResults(
        results.results.map((r) => ({
          interactionId: r.interactionId,
          overallScore: r.overallScore,
          passed: r.scores.filter((s) => s.passed).length,
          failed: r.scores.filter((s) => !s.passed).length,
        }))
      );
      toast.success(`Tested on ${results.results.length} interactions`);
    } catch {
      toast.error('Failed to run test');
    }
  };

  if (isLoadingRubric) {
    return (
      <div className="min-h-screen bg-[#0A1835] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1835] p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#F9FAFB] flex items-center gap-3">
          <Settings className="h-8 w-8 text-indigo-600" />
          QA Rubric Configuration
        </h1>
        <p className="mt-1 text-[#9CA3AF]">
          Configure scoring dimensions and weights for AI quality assessment
        </p>
      </div>

      {/* Weight validation warning */}
      {!isWeightValid && (
        <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-300 font-medium">Weights do not sum to 100%</p>
            <p className="text-red-400 text-sm">
              Current total: {totalWeight}%. Adjust dimension weights to equal 100%.
            </p>
          </div>
        </div>
      )}

      {/* Dimension cards */}
      <div className="space-y-6 mb-8">
        {dimensions.map((dimension) => (
          <DimensionCard
            key={dimension.key}
            dimension={dimension}
            icon={dimensionIcons[dimension.key]}
            onChange={(updates) => updateDimension(dimension.key, updates)}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="bg-[#162240] rounded-xl border border-[#1E3461] p-4 sticky bottom-6 flex items-center justify-between shadow-lg">
        <button
          onClick={handleResetToDefaults}
          className="flex items-center gap-2 px-4 py-2 text-[#F9FAFB] hover:bg-[#0F1F3D] rounded-lg"
        >
          <RotateCcw className="h-4 w-4" />
          Reset to Defaults
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2 border border-[#1E3461] rounded-lg text-[#F9FAFB] hover:bg-[#0F1F3D] disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Test on Last 10 Calls
          </button>

          <button
            onClick={handleSave}
            disabled={!hasChanges || !isWeightValid || isUpdating}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Rubric
          </button>
        </div>
      </div>

      {/* Test results */}
      {testResults && (
        <div className="mt-8 bg-[#162240] rounded-xl border border-[#1E3461] p-6">
          <h3 className="text-lg font-semibold text-[#F9FAFB] mb-4 flex items-center gap-2">
            <Play className="h-5 w-5 text-indigo-600" />
            Test Results
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#9CA3AF] border-b border-[#1E3461]">
                  <th className="px-4 py-2 font-medium">Interaction ID</th>
                  <th className="px-4 py-2 font-medium text-right">Overall Score</th>
                  <th className="px-4 py-2 font-medium text-right">Passed</th>
                  <th className="px-4 py-2 font-medium text-right">Failed</th>
                </tr>
              </thead>
              <tbody>
                {testResults.map((result) => (
                  <tr key={result.interactionId} className="border-b border-[#1E3461]/50">
                    <td className="px-4 py-2 font-mono text-xs text-[#9CA3AF]">
                      {result.interactionId.slice(0, 12)}...
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          result.overallScore >= 80
                            ? 'bg-green-100 text-green-700'
                            : result.overallScore >= 60
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {result.overallScore}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-green-600">{result.passed}/5</td>
                    <td className="px-4 py-2 text-right text-red-600">{result.failed}/5</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-3 bg-[#0F1F3D] rounded-lg text-sm text-[#9CA3AF]">
            Average Score:{' '}
            <span className="font-bold text-[#F9FAFB]">
              {(testResults.reduce((sum, r) => sum + r.overallScore, 0) / testResults.length).toFixed(1)}
            </span>
          </div>
        </div>
      )}

      {/* Last updated info */}
      {rubricData?.rubric?.updatedBy && (
        <div className="mt-6 text-sm text-[#9CA3AF] text-center">
          Last updated by {rubricData.rubric.updatedBy.name} on{' '}
          {new Date(rubricData.rubric.updatedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

// Individual dimension card
function DimensionCard({
  dimension,
  icon,
  onChange,
}: {
  dimension: QARubricDimension;
  icon: React.ReactNode;
  onChange: (updates: Partial<QARubricDimension>) => void;
}) {
  return (
    <div className="bg-[#162240] rounded-xl border border-[#1E3461] p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-indigo-900/50 text-indigo-400 rounded-lg">{icon}</div>
        <div>
          <h3 className="text-lg font-semibold text-[#F9FAFB]">{dimension.name}</h3>
          <p className="text-xs text-[#9CA3AF] font-mono">{dimension.key}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Weight slider */}
        <div>
          <label className="block text-sm font-medium text-[#F9FAFB] mb-2 flex items-center gap-2">
            Weight
            <span className="text-xs text-[#6B7280]">(must sum to 100%)</span>
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={50}
              value={dimension.weight}
              onChange={(e) => onChange({ weight: parseInt(e.target.value) })}
              className="flex-1 h-2 bg-[#0F1F3D] rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="w-16 text-right">
              <span className="text-xl font-bold text-indigo-400">{dimension.weight}</span>
              <span className="text-[#9CA3AF]">%</span>
            </div>
          </div>
        </div>

        {/* Min pass score slider */}
        <div>
          <label className="block text-sm font-medium text-[#F9FAFB] mb-2 flex items-center gap-2">
            Min Pass Score
            <span className="text-xs text-[#6B7280]">(0-10)</span>
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={10}
              value={dimension.minPassScore}
              onChange={(e) => onChange({ minPassScore: parseInt(e.target.value) })}
              className="flex-1 h-2 bg-[#0F1F3D] rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="w-16 text-right">
              <span className="text-xl font-bold text-indigo-400">{dimension.minPassScore}</span>
              <span className="text-[#9CA3AF]">/10</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scoring guide */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-[#F9FAFB] mb-2 flex items-center gap-2">
          <Info className="h-4 w-4 text-[#6B7280]" />
          Scoring Guide
          <span className="text-xs text-[#6B7280]">(Instructions for GPT-4o)</span>
        </label>
        <textarea
          value={dimension.scoringGuide}
          onChange={(e) => onChange({ scoringGuide: e.target.value })}
          rows={3}
          className="w-full px-4 py-3 bg-[#0A1835] border border-[#1E3461] rounded-lg text-sm text-[#F9FAFB] placeholder-[#6B7280] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="Describe how this dimension should be scored..."
        />
      </div>
    </div>
  );
}

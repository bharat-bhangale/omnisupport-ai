import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Building2,
  Loader2,
  Sparkles,
  ArrowRight,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSignUpMutation } from '../api/authApi';

export default function SignUp() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'account' | 'company'>('account');
  const [showPassword, setShowPassword] = useState(false);

  // Account info
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Company info
  const [companyName, setCompanyName] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [industry, setIndustry] = useState('');

  const [signUp, { isLoading }] = useSignUpMutation();

  // Password strength checks
  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const isPasswordValid = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleAccountNext = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !email || !password || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (!isPasswordValid) {
      toast.error('Please meet all password requirements');
      return;
    }

    if (!passwordsMatch) {
      toast.error('Passwords do not match');
      return;
    }

    setStep('company');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName) {
      toast.error('Please enter your company name');
      return;
    }

    try {
      const result = await signUp({
        name,
        email,
        password,
        companyName,
        companySize,
        industry,
      }).unwrap();

      // Store tokens
      localStorage.setItem('auth_token', result.accessToken);
      if (result.refreshToken) {
        localStorage.setItem('refresh_token', result.refreshToken);
      }

      // Store user info
      localStorage.setItem('user_id', result.user.id);
      localStorage.setItem('user_name', result.user.name);
      localStorage.setItem('user_email', result.user.email);
      localStorage.setItem('company_id', result.user.companyId);
      localStorage.setItem('company_name', companyName);

      toast.success('Account created! Let\'s set up your AI assistant.');
      navigate('/onboarding');
    } catch (error: unknown) {
      const err = error as { data?: { message?: string } };
      toast.error(err.data?.message || 'Failed to create account');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1835] flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F766E]/20 to-[#3B82F6]/20" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMjI4MzEiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-40" />

        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0F766E] to-[#3B82F6] flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-[#F9FAFB]">OmniSupport AI</h1>
          </div>

          <h2 className="text-4xl font-bold text-[#F9FAFB] mb-4">
            Start Your 14-Day Free Trial
          </h2>
          <p className="text-xl text-[#9CA3AF] mb-8">
            No credit card required. Get your AI support agent live in under 30 minutes.
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-[#9CA3AF]">
              <div className="w-8 h-8 rounded-full bg-[#0F766E]/20 flex items-center justify-center">
                <span className="text-[#0F766E]">1</span>
              </div>
              <span>Create your account & connect channels</span>
            </div>
            <div className="flex items-center gap-3 text-[#9CA3AF]">
              <div className="w-8 h-8 rounded-full bg-[#0F766E]/20 flex items-center justify-center">
                <span className="text-[#0F766E]">2</span>
              </div>
              <span>Upload your knowledge base documents</span>
            </div>
            <div className="flex items-center gap-3 text-[#9CA3AF]">
              <div className="w-8 h-8 rounded-full bg-[#0F766E]/20 flex items-center justify-center">
                <span className="text-[#0F766E]">3</span>
              </div>
              <span>Test with a live call & go live!</span>
            </div>
          </div>

          <div className="mt-12 p-6 bg-[#162240]/50 rounded-xl border border-[#1E3461]">
            <p className="text-[#9CA3AF] italic">
              "We reduced our average handling time by 60% and our agents now focus on complex issues while the AI handles routine queries."
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6]" />
              <div>
                <p className="text-[#F9FAFB] font-medium">Sarah Chen</p>
                <p className="text-[#6B7280] text-sm">VP of Customer Success, TechCorp</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - SignUp Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0F766E] to-[#3B82F6] flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[#F9FAFB]">OmniSupport AI</h1>
          </div>

          <div className="bg-[#162240] rounded-2xl border border-[#1E3461] shadow-xl p-8">
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <div
                className={`flex items-center gap-2 ${
                  step === 'account' ? 'text-[#3B82F6]' : 'text-[#6B7280]'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step === 'account'
                      ? 'bg-[#3B82F6] text-white'
                      : step === 'company'
                        ? 'bg-[#3B82F6]/20 text-[#3B82F6]'
                        : 'bg-[#1E3461] text-[#6B7280]'
                  }`}
                >
                  {step === 'company' ? <Check className="w-4 h-4" /> : '1'}
                </div>
                <span className="text-sm font-medium hidden sm:block">Account</span>
              </div>
              <div className="w-8 h-px bg-[#1E3461]" />
              <div
                className={`flex items-center gap-2 ${
                  step === 'company' ? 'text-[#3B82F6]' : 'text-[#6B7280]'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step === 'company'
                      ? 'bg-[#3B82F6] text-white'
                      : 'bg-[#1E3461] text-[#6B7280]'
                  }`}
                >
                  2
                </div>
                <span className="text-sm font-medium hidden sm:block">Company</span>
              </div>
            </div>

            {step === 'account' ? (
              <form onSubmit={handleAccountNext} className="space-y-5">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-[#F9FAFB]">Create your account</h2>
                  <p className="text-[#9CA3AF] mt-1">Start your free trial today</p>
                </div>

                {/* Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-[#9CA3AF] mb-1.5">
                    Full name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Smith"
                      className="w-full pl-10 pr-4 py-3 bg-[#0A1835] border border-[#1E3461] rounded-lg text-[#F9FAFB] placeholder-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
                      autoComplete="name"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-[#9CA3AF] mb-1.5">
                    Work email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@company.com"
                      className="w-full pl-10 pr-4 py-3 bg-[#0A1835] border border-[#1E3461] rounded-lg text-[#F9FAFB] placeholder-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-[#9CA3AF] mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-12 py-3 bg-[#0A1835] border border-[#1E3461] rounded-lg text-[#F9FAFB] placeholder-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#9CA3AF]"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {/* Password requirements */}
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    <span className={passwordChecks.length ? 'text-[#10B981]' : 'text-[#6B7280]'}>
                      ✓ 8+ characters
                    </span>
                    <span className={passwordChecks.uppercase ? 'text-[#10B981]' : 'text-[#6B7280]'}>
                      ✓ Uppercase
                    </span>
                    <span className={passwordChecks.lowercase ? 'text-[#10B981]' : 'text-[#6B7280]'}>
                      ✓ Lowercase
                    </span>
                    <span className={passwordChecks.number ? 'text-[#10B981]' : 'text-[#6B7280]'}>
                      ✓ Number
                    </span>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-[#9CA3AF] mb-1.5"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                    <input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full pl-10 pr-4 py-3 bg-[#0A1835] border rounded-lg text-[#F9FAFB] placeholder-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent ${
                        confirmPassword && !passwordsMatch
                          ? 'border-red-500'
                          : 'border-[#1E3461]'
                      }`}
                      autoComplete="new-password"
                    />
                  </div>
                  {confirmPassword && !passwordsMatch && (
                    <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-[#3B82F6] hover:bg-[#1D4ED8] text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  Continue
                  <ArrowRight className="w-5 h-5" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-[#F9FAFB]">Tell us about your company</h2>
                  <p className="text-[#9CA3AF] mt-1">This helps us customize your experience</p>
                </div>

                {/* Company Name */}
                <div>
                  <label
                    htmlFor="companyName"
                    className="block text-sm font-medium text-[#9CA3AF] mb-1.5"
                  >
                    Company name
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                    <input
                      id="companyName"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Inc."
                      className="w-full pl-10 pr-4 py-3 bg-[#0A1835] border border-[#1E3461] rounded-lg text-[#F9FAFB] placeholder-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Company Size */}
                <div>
                  <label
                    htmlFor="companySize"
                    className="block text-sm font-medium text-[#9CA3AF] mb-1.5"
                  >
                    Company size
                  </label>
                  <select
                    id="companySize"
                    value={companySize}
                    onChange={(e) => setCompanySize(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0A1835] border border-[#1E3461] rounded-lg text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
                  >
                    <option value="">Select size</option>
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201-500">201-500 employees</option>
                    <option value="500+">500+ employees</option>
                  </select>
                </div>

                {/* Industry */}
                <div>
                  <label
                    htmlFor="industry"
                    className="block text-sm font-medium text-[#9CA3AF] mb-1.5"
                  >
                    Industry
                  </label>
                  <select
                    id="industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0A1835] border border-[#1E3461] rounded-lg text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
                  >
                    <option value="">Select industry</option>
                    <option value="saas">SaaS / Software</option>
                    <option value="ecommerce">E-Commerce</option>
                    <option value="finance">Finance / Banking</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="education">Education</option>
                    <option value="retail">Retail</option>
                    <option value="travel">Travel / Hospitality</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('account')}
                    className="flex-1 py-3 px-4 border border-[#1E3461] text-[#9CA3AF] font-semibold rounded-lg hover:bg-[#0F1F3D] transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-3 px-4 bg-[#3B82F6] hover:bg-[#1D4ED8] disabled:bg-[#3B82F6]/50 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Start free trial
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Terms */}
            <p className="mt-6 text-center text-xs text-[#6B7280]">
              By signing up, you agree to our{' '}
              <a href="/terms" className="text-[#3B82F6] hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-[#3B82F6] hover:underline">
                Privacy Policy
              </a>
            </p>

            {/* Login link */}
            <p className="mt-4 text-center text-sm text-[#9CA3AF]">
              Already have an account?{' '}
              <Link to="/login" className="text-[#3B82F6] hover:text-[#60A5FA] font-semibold">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

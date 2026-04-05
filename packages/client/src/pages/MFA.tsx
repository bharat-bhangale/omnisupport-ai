import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Sparkles, ArrowRight, RefreshCw, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { useVerifyMfaMutation, useResendMfaCodeMutation } from '../api/authApi';

export default function MFA() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, mfaToken } = (location.state as { email?: string; mfaToken?: string }) || {};

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [verifyMfa, { isLoading: isVerifying }] = useVerifyMfaMutation();
  const [resendCode, { isLoading: isResending }] = useResendMfaCodeMutation();

  // Redirect if no email/mfaToken
  useEffect(() => {
    if (!email || !mfaToken) {
      navigate('/login');
    }
  }, [email, mfaToken, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Handle input change
  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newCode = [...code];
    newCode[index] = value.slice(-1); // Only keep last digit
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (newCode.every((d) => d !== '') && newCode.join('').length === 6) {
      handleSubmit(newCode.join(''));
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      const newCode = pastedData.split('');
      setCode(newCode);
      inputRefs.current[5]?.focus();
      handleSubmit(pastedData);
    }
  };

  // Submit verification
  const handleSubmit = async (fullCode: string) => {
    if (fullCode.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }

    try {
      const result = await verifyMfa({
        email: email!,
        code: fullCode,
        mfaToken: mfaToken!,
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
      localStorage.setItem('company_name', result.user.companyName || 'OmniSupport');

      toast.success('Verified successfully!');

      if (result.user.onboardingComplete === false) {
        navigate('/onboarding');
      } else {
        navigate('/dashboard');
      }
    } catch (error: unknown) {
      const err = error as { data?: { message?: string } };
      toast.error(err.data?.message || 'Invalid code. Please try again.');
      // Clear code on error
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  // Resend code
  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;

    try {
      await resendCode({ email: email!, mfaToken: mfaToken! }).unwrap();
      toast.success('New code sent to your email');
      setResendCooldown(60);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (error: unknown) {
      const err = error as { data?: { message?: string } };
      toast.error(err.data?.message || 'Failed to resend code');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1835] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0F766E] to-[#3B82F6] flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#F9FAFB]">OmniSupport AI</h1>
        </div>

        <div className="bg-[#162240] rounded-2xl border border-[#1E3461] shadow-xl p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-[#3B82F6]/20 flex items-center justify-center">
              <Shield className="w-8 h-8 text-[#3B82F6]" />
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#F9FAFB]">Two-Factor Authentication</h2>
            <p className="text-[#9CA3AF] mt-2">
              We sent a 6-digit code to{' '}
              <span className="font-medium text-[#F9FAFB]">{email}</span>
            </p>
          </div>

          {/* Code inputs */}
          <div className="flex justify-center gap-2 mb-8" onPaste={handlePaste}>
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 text-center text-2xl font-bold bg-[#0A1835] border-2 border-[#1E3461] rounded-lg text-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-colors"
                autoFocus={index === 0}
              />
            ))}
          </div>

          {/* Verify button */}
          <button
            onClick={() => handleSubmit(code.join(''))}
            disabled={isVerifying || code.some((d) => !d)}
            className="w-full py-3 px-4 bg-[#3B82F6] hover:bg-[#1D4ED8] disabled:bg-[#3B82F6]/50 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors mb-4"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                Verify
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          {/* Resend */}
          <div className="text-center">
            <p className="text-sm text-[#9CA3AF] mb-2">Didn't receive the code?</p>
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0 || isResending}
              className="inline-flex items-center gap-2 text-[#3B82F6] hover:text-[#60A5FA] font-medium disabled:text-[#6B7280] disabled:cursor-not-allowed"
            >
              {isResending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>

          {/* Back to login */}
          <p className="mt-8 text-center text-sm text-[#9CA3AF]">
            <button
              onClick={() => navigate('/login')}
              className="text-[#3B82F6] hover:text-[#60A5FA] font-medium"
            >
              ← Back to login
            </button>
          </p>
        </div>

        {/* Security note */}
        <p className="mt-6 text-center text-xs text-[#6B7280]">
          For your security, this code expires in 10 minutes
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Mic,
  Menu,
  X,
  Check,
  Star,
  Plug,
  BookOpen,
  Bot,
  Rocket,
  Brain,
  ClipboardList,
  FileText,
  BarChart3,
  Link2,
  RefreshCw,
  Twitter,
  Linkedin,
  Github,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================
interface PricingPlan {
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  subtitle: string;
  features: string[];
  badge?: string;
  badgeColor?: string;
  buttonStyle: 'outline' | 'blue' | 'teal' | 'gray';
  isPopular?: boolean;
}

interface Testimonial {
  quote: string;
  name: string;
  title: string;
  initials: string;
  avatarColor: string;
}

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface HowItWorksStep {
  icon: React.ReactNode;
  title: string;
  description: string;
}

// ============================================================================
// DATA
// ============================================================================
const pricingPlans: PricingPlan[] = [
  {
    name: 'Starter',
    monthlyPrice: 299,
    annualPrice: 239,
    subtitle: 'For small support teams just getting started',
    features: [
      '500 voice minutes/month',
      '5,000 tickets/month',
      '5 agent seats',
      'Basic analytics',
      '2 integrations (Zendesk or Freshdesk)',
    ],
    buttonStyle: 'outline',
  },
  {
    name: 'Growth',
    monthlyPrice: 599,
    annualPrice: 479,
    subtitle: 'For growing teams scaling support operations',
    features: [
      '1,500 voice minutes/month',
      '20,000 tickets/month',
      'Multilingual (29 languages)',
      'Sentiment alerts',
      '5 integrations',
      'Workflow automation',
    ],
    badge: 'Most Popular',
    badgeColor: 'bg-[#3B82F6]',
    buttonStyle: 'blue',
    isPopular: true,
  },
  {
    name: 'Pro',
    monthlyPrice: 999,
    annualPrice: 799,
    subtitle: 'For teams needing advanced AI capabilities',
    features: [
      '3,000 voice minutes/month',
      '50,000 tickets/month',
      'Voice cloning',
      'Fraud detection',
      'QA scoring',
      'Unlimited integrations',
    ],
    badge: 'Best Value',
    badgeColor: 'bg-[#0F766E]',
    buttonStyle: 'teal',
  },
  {
    name: 'Enterprise',
    monthlyPrice: null,
    annualPrice: null,
    subtitle: 'Custom solutions for large organizations',
    features: [
      'Unlimited voice minutes',
      'Unlimited tickets',
      'SLA guarantee',
      'SSO (SAML/OIDC)',
      'On-premises option',
      'Dedicated support + training',
    ],
    buttonStyle: 'gray',
  },
];

const testimonials: Testimonial[] = [
  {
    quote:
      'We reduced average handle time from 11 minutes to 2 minutes in the first week. The AI draft quality is remarkable.',
    name: 'Sarah Chen',
    title: 'Head of Support · TechFlow SaaS',
    initials: 'SC',
    avatarColor: 'bg-[#3B82F6]',
  },
  {
    quote:
      'The voice AI handles our peak hours without any human intervention. 70% resolution on calls was unimaginable before OmniSupport.',
    name: 'Raj Malhotra',
    title: 'VP Operations · Nexus Commerce',
    initials: 'RM',
    avatarColor: 'bg-[#0F766E]',
  },
  {
    quote:
      'Setup took 12 minutes. Our Zendesk is now fully connected and every ticket gets an AI draft within 8 seconds of arrival.',
    name: 'Emma Larsen',
    title: 'Customer Success Lead · BuildFast Inc',
    initials: 'EL',
    avatarColor: 'bg-[#8B5CF6]',
  },
];

const features: Feature[] = [
  {
    icon: <Brain className="w-6 h-6" />,
    title: 'Context Memory',
    description:
      'AI remembers every turn of the conversation — customers never repeat themselves.',
  },
  {
    icon: <ClipboardList className="w-6 h-6" />,
    title: 'Auto Classification',
    description:
      'Every ticket classified and routed in under 30 seconds. 90-95% accuracy.',
  },
  {
    icon: <FileText className="w-6 h-6" />,
    title: 'RAG Response Drafts',
    description:
      'Responses pulled directly from your knowledge base with source citations.',
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: 'Unified Analytics',
    description:
      'Voice + text metrics on one live dashboard. Proves ROI in real numbers.',
  },
  {
    icon: <Link2 className="w-6 h-6" />,
    title: 'CRM Sync',
    description:
      'Zendesk, Freshdesk, Salesforce bidirectional sync in real time.',
  },
  {
    icon: <RefreshCw className="w-6 h-6" />,
    title: 'Continuous Learning',
    description:
      'AI resolution rate improves 5-10% every month from agent feedback.',
  },
];

const howItWorksSteps: HowItWorksStep[] = [
  {
    icon: <Plug className="w-7 h-7" />,
    title: 'Connect',
    description: 'Link your Twilio phone number and Zendesk or Freshdesk account.',
  },
  {
    icon: <BookOpen className="w-7 h-7" />,
    title: 'Upload Knowledge',
    description: 'Add your support docs, FAQs, and policies. AI indexes them in minutes.',
  },
  {
    icon: <Bot className="w-7 h-7" />,
    title: 'Configure AI',
    description: 'Set your agent name, greeting message, and ticket categories.',
  },
  {
    icon: <Rocket className="w-7 h-7" />,
    title: 'Go Live',
    description: 'AI begins handling calls and tickets immediately. No waiting.',
  },
];

const companyLogos = [
  'Acme Corp',
  'TechFlow',
  'Nexus AI',
  'BuildFast',
  'CloudOps',
  'ShipRight',
];

// ============================================================================
// CUSTOM HOOKS
// ============================================================================
function useCountUp(
  targetValue: number,
  duration: number = 2000,
  isInView: boolean
): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    let startTime: number | null = null;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * targetValue));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [targetValue, duration, isInView]);

  return count;
}

function useInView(ref: React.RefObject<HTMLElement | null>): boolean {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [ref]);

  return isInView;
}

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

// Navigation
function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Docs', href: '#docs' },
    { label: 'Blog', href: '#blog' },
  ];

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#0A1835]/95 backdrop-blur-xl border-b border-[#1E3461]'
          : 'bg-[#0A1835]/60 backdrop-blur-xl'
      }`}
    >
      <nav className="flex justify-between items-center max-w-7xl mx-auto px-4 md:px-8 h-[72px]">
        <Link to="/" className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-[#3B82F6]" />
          <span className="text-xl font-bold tracking-tight text-[#F9FAFB]">OmniSupport</span>
          <span className="bg-[#3B82F6] text-white text-xs font-bold px-2 py-0.5 rounded-md">AI</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 font-medium text-sm">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[#9CA3AF] hover:text-[#F9FAFB] transition-colors duration-150"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link
            to="/login"
            className="px-4 py-2 border border-[#3B82F6] text-[#3B82F6] font-medium rounded-lg hover:bg-[#3B82F6]/10 transition-colors duration-150"
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            className="px-4 py-2 bg-[#3B82F6] text-white font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors duration-150 flex items-center gap-1"
          >
            Start Free Trial <span>→</span>
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-[#9CA3AF] hover:text-[#F9FAFB]"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      <div className={`md:hidden overflow-hidden transition-all duration-300 ${mobileMenuOpen ? 'max-h-96' : 'max-h-0'}`}>
        <div className="px-4 py-4 bg-[#0A1835]/95 backdrop-blur-xl border-t border-[#1E3461]">
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-[#9CA3AF] hover:text-[#F9FAFB] py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <hr className="border-[#1E3461]" />
            <Link to="/login" className="text-[#3B82F6] font-medium py-2" onClick={() => setMobileMenuOpen(false)}>
              Sign In
            </Link>
            <Link
              to="/signup"
              className="w-full px-4 py-3 bg-[#3B82F6] text-white font-semibold rounded-lg text-center"
              onClick={() => setMobileMenuOpen(false)}
            >
              Start Free Trial →
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

// Hero Section
function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden bg-gradient-to-b from-[#0A1835] to-[#0F2060]">
      {/* Gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#3B82F6]/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#0F766E]/15 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left column - Text */}
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#3B82F6]/15 border border-[#3B82F6] text-[#93C5FD] text-xs font-bold tracking-wider uppercase mb-8">
              ✦ Powered by GPT-4o + Vapi.ai
            </span>

            <h1 className="text-4xl md:text-5xl lg:text-[48px] font-bold tracking-tight mb-6 leading-[1.1]">
              <span className="text-[#F9FAFB]">Your AI Team Handles Every</span>
              <br />
              <span className="bg-gradient-to-r from-[#3B82F6] to-[#0F766E] bg-clip-text text-transparent">
                Support Call & Ticket
              </span>
            </h1>

            <p className="text-lg text-[#9CA3AF] max-w-[520px] leading-relaxed mb-8 mx-auto lg:mx-0">
              OmniSupport AI resolves 70% of inbound phone calls and auto-drafts responses for every support ticket — same AI brain, same knowledge base, one platform.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-6">
              <Link
                to="/signup"
                className="px-8 py-4 bg-[#3B82F6] text-white font-bold rounded-lg hover:bg-[#1D4ED8] transition-all duration-200 hover:scale-[1.02] active:scale-[0.97] shadow-lg shadow-[#3B82F6]/20"
              >
                Start Free Trial →
              </Link>
              <button className="px-8 py-4 border border-[#1E3461] text-[#9CA3AF] font-bold rounded-lg hover:bg-[#162240] transition-colors duration-200 flex items-center justify-center gap-2">
                ▶ Watch Demo
              </button>
            </div>

            <p className="text-[13px] text-[#6B7280]">
              ✓ No credit card required &nbsp; ✓ Up and running in 15 minutes &nbsp; ✓ Cancel anytime
            </p>
          </div>

          {/* Right column - 3D Mockup */}
          <div className="relative perspective-[1000px]">
            <div
              className="transform rotate-x-[8deg] rotate-y-[-3deg] animate-float bg-[#111F3C] border border-[#1E3461]/30 rounded-xl overflow-hidden shadow-2xl shadow-black/50"
              style={{ boxShadow: '0 0 80px rgba(59, 130, 246, 0.2)' }}
            >
              {/* Browser chrome */}
              <div className="h-8 bg-[#1C2947] flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/50" />
              </div>

              {/* App content */}
              <div className="p-6 grid grid-cols-12 gap-4 bg-[#0D1B38]/50">
                {/* Left panel - Call card */}
                <div className="col-span-5 space-y-4">
                  <div className="bg-[#1C2947] p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-[#9CA3AF]">INBOUND CALL</span>
                      <span className="flex items-center text-[10px] text-green-400 font-bold">
                        <span className="w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse" />
                        LIVE
                      </span>
                    </div>
                    <div className="h-2 bg-[#1E3461]/40 rounded-full mb-2 overflow-hidden">
                      <div className="h-full bg-[#0F766E] w-[78%]" />
                    </div>
                    <p className="text-[10px] text-[#0F766E] font-bold">78% AI CONFIDENCE</p>
                  </div>
                  <div className="bg-[#111F3C] p-4 rounded-lg border-l-4 border-[#3B82F6]">
                    <p className="text-xs text-[#F9FAFB] italic">"I need to update my billing address..."</p>
                  </div>
                </div>

                {/* Right panel - Ticket queue */}
                <div className="col-span-7 bg-[#111F3C] p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-bold text-[#F9FAFB]">Ticket Queue</h4>
                    <span className="px-2 py-0.5 rounded bg-[#3B82F6]/10 text-[#3B82F6] text-[10px] font-bold">
                      ✦ DRAFT READY
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="h-12 bg-[#0D1B38] rounded flex items-center px-3 border border-[#1E3461]/10">
                      <div className="w-2 h-2 rounded-full bg-blue-400 mr-3" />
                      <div className="flex-1 space-y-1">
                        <div className="h-2 w-1/3 bg-[#1E3461]/40 rounded" />
                        <div className="h-2 w-1/2 bg-[#1E3461]/20 rounded" />
                      </div>
                      <span className="text-[10px] text-[#3B82F6] bg-[#3B82F6]/10 px-2 py-0.5 rounded">Drafted</span>
                    </div>
                    <div className="h-12 bg-[#0D1B38] rounded flex items-center px-3 border border-[#1E3461]/10">
                      <div className="w-2 h-2 rounded-full bg-orange-400 mr-3" />
                      <div className="flex-1 space-y-1">
                        <div className="h-2 w-1/4 bg-[#1E3461]/40 rounded" />
                        <div className="h-2 w-1/3 bg-[#1E3461]/20 rounded" />
                      </div>
                      <span className="text-[10px] text-[#9CA3AF]">Reviewing...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating mini cards */}
            <div className="absolute -top-6 -left-6 bg-[#283452]/60 backdrop-blur-xl border border-[#1E3461]/20 p-3 rounded-xl shadow-xl flex items-center gap-3 hover:-translate-y-1 transition-transform duration-300">
              <Check className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-xs font-bold text-[#F9FAFB]">Resolved by AI</p>
                <p className="text-[10px] text-[#9CA3AF]">in 2m 14s</p>
              </div>
            </div>

            <div className="absolute -bottom-4 -right-6 bg-[#283452]/60 backdrop-blur-xl border border-[#1E3461]/20 p-3 rounded-xl shadow-xl flex items-center gap-3 hover:translate-y-1 transition-transform duration-300">
              <span className="text-xl">💰</span>
              <div>
                <p className="text-xs font-bold text-[#F9FAFB]">Cost saved today</p>
                <p className="text-lg font-black text-[#0F766E]">$1,247</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: perspective(1000px) rotateX(8deg) rotateY(-3deg) translateY(0px); }
          50% { transform: perspective(1000px) rotateX(8deg) rotateY(-3deg) translateY(-12px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
    </section>
  );
}

// Social Proof Strip
function SocialProofStrip() {
  return (
    <section className="bg-[#0F1F3D] py-7 border-y border-[#1E3461]/30">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <p className="text-center text-[#6B7280] text-[13px] font-semibold uppercase tracking-widest mb-6">
          Trusted by support teams at
        </p>
        <div className="flex flex-wrap justify-center gap-12 opacity-50">
          {companyLogos.map((name) => (
            <span key={name} className="text-[14px] font-bold text-[#6B7280]">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// Two Channel Section
function TwoChannelSection() {
  const voiceFeatures = [
    'Resolves 70% of calls without a human',
    'Sub-500ms response latency',
    '29 languages + custom brand voice',
    'Warm handoff with full call context',
  ];

  const textFeatures = [
    '90-95% classification accuracy',
    'Draft response ready in under 8 seconds',
    'Knowledge base citations included',
    'Handle time: 10 minutes → under 2 minutes',
  ];

  return (
    <section className="py-20 relative bg-[#0A1835]">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-[#F9FAFB] tracking-tight mb-4">
            One Platform. Two Channels. Total Automation.
          </h2>
          <p className="text-[#9CA3AF] text-lg">
            Connect your phone number and helpdesk. AI handles the rest.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Voice Channel */}
          <div className="bg-[#162240] border border-[#1E3461] border-t-[3px] border-t-[#0F766E] rounded-xl p-8 relative overflow-hidden group hover:border-[#0F766E] transition-all duration-200 hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#0F766E]/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
            <span className="text-5xl mb-6 block">🎙️</span>
            <h3 className="text-[22px] font-bold text-[#F9FAFB] mb-2">AI Voice Agent</h3>
            <p className="text-[15px] text-[#9CA3AF] mb-6">Answers every inbound call automatically</p>

            {/* Flow diagram */}
            <div className="flex flex-wrap items-center gap-2 mb-6 text-[10px] text-[#0F766E]">
              <span className="px-2 py-1 bg-[#0F766E]/10 rounded">Customer</span>
              <span>→</span>
              <span className="px-2 py-1 bg-[#0F766E]/10 rounded">Twilio</span>
              <span>→</span>
              <span className="px-2 py-1 bg-[#0F766E]/10 rounded">Vapi AI</span>
              <span>→</span>
              <span className="px-2 py-1 bg-[#0F766E]/10 rounded">GPT-4o</span>
              <span>→</span>
              <span className="px-2 py-1 bg-[#0F766E]/10 rounded">ElevenLabs</span>
            </div>

            <ul className="space-y-3">
              {voiceFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-[#F9FAFB]">
                  <Check className="w-4 h-4 text-[#0F766E] flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Text Channel */}
          <div className="bg-[#162240] border border-[#1E3461] border-t-[3px] border-t-[#3B82F6] rounded-xl p-8 relative overflow-hidden group hover:border-[#3B82F6] transition-all duration-200 hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#3B82F6]/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
            <span className="text-5xl mb-6 block">🎫</span>
            <h3 className="text-[22px] font-bold text-[#F9FAFB] mb-2">AI Ticket Agent</h3>
            <p className="text-[15px] text-[#9CA3AF] mb-6">Classifies and drafts every support ticket</p>

            {/* Flow diagram */}
            <div className="flex flex-wrap items-center gap-2 mb-6 text-[10px] text-[#3B82F6]">
              <span className="px-2 py-1 bg-[#3B82F6]/10 rounded">Email/Chat/Portal</span>
              <span>→</span>
              <span className="px-2 py-1 bg-[#3B82F6]/10 rounded">Classify</span>
              <span>→</span>
              <span className="px-2 py-1 bg-[#3B82F6]/10 rounded">RAG Draft</span>
              <span>→</span>
              <span className="px-2 py-1 bg-[#3B82F6]/10 rounded">Agent Sends</span>
            </div>

            <ul className="space-y-3">
              {textFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-[#F9FAFB]">
                  <Check className="w-4 h-4 text-[#3B82F6] flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// Stats Bar
function StatsBar() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef);

  const stat1 = useCountUp(70, 2000, isInView);
  const stat2 = useCountUp(85, 2000, isInView);
  const stat4 = useCountUp(29, 2000, isInView);

  return (
    <section
      ref={sectionRef}
      className="bg-gradient-to-br from-[#0F1F3D] to-[#162240] py-12 border-y border-[#1E3461]"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div className="relative">
            <p className="text-4xl md:text-5xl font-black text-[#F9FAFB] mb-2">{stat1}%</p>
            <p className="text-xs font-bold uppercase tracking-widest text-[#9CA3AF]">
              AI call resolution rate
            </p>
          </div>
          <div className="relative md:border-l border-[#1E3461]">
            <p className="text-4xl md:text-5xl font-black text-[#F9FAFB] mb-2">{stat2}%</p>
            <p className="text-xs font-bold uppercase tracking-widest text-[#9CA3AF]">
              Cost reduction vs human agents
            </p>
          </div>
          <div className="relative md:border-l border-[#1E3461]">
            <p className="text-4xl md:text-5xl font-black text-[#F9FAFB] mb-2">$0.44</p>
            <p className="text-xs font-bold uppercase tracking-widest text-[#9CA3AF]">
              Cost per 5-minute AI call
            </p>
          </div>
          <div className="relative md:border-l border-[#1E3461]">
            <p className="text-4xl md:text-5xl font-black text-[#F9FAFB] mb-2">{stat4}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-[#9CA3AF]">
              Supported languages
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// Feature Grid
function FeatureGrid() {
  return (
    <section id="features" className="py-20 bg-[#0A1835]">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-[#F9FAFB] tracking-tight mb-4">
            Everything your support team needs
          </h2>
          <p className="text-[#9CA3AF] text-lg">
            Built on GPT-4o, Vapi.ai, and Pinecone. Deployed in 15 minutes.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-[#162240] border border-[#1E3461] rounded-xl p-7 hover:border-[#3B82F6] hover:-translate-y-1 transition-all duration-200 group"
            >
              <div className="w-12 h-12 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center text-[#3B82F6] mb-4 group-hover:bg-[#3B82F6]/20 transition-colors">
                {feature.icon}
              </div>
              <h3 className="text-[18px] font-bold text-[#F9FAFB] mb-2">{feature.title}</h3>
              <p className="text-[14px] text-[#9CA3AF] leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// How It Works
function HowItWorks() {
  return (
    <section className="py-20 bg-[#0F1F3D]">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-[#F9FAFB] tracking-tight mb-4">
            Up and running in under 15 minutes
          </h2>
          <p className="text-[#9CA3AF] text-lg">No engineering team required.</p>
        </div>

        <div className="relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-[#1E3461]/50" style={{ zIndex: 0 }} />

          <div className="grid md:grid-cols-4 gap-8 relative z-10">
            {howItWorksSteps.map((step, idx) => (
              <div key={step.title} className="text-center">
                <div className="w-10 h-10 bg-[#3B82F6] rounded-full flex items-center justify-center text-white font-bold mx-auto mb-4">
                  {idx + 1}
                </div>
                <div className="w-16 h-16 bg-[#162240] border border-[#3B82F6]/30 rounded-xl flex items-center justify-center mx-auto mb-4 text-[#3B82F6]">
                  {step.icon}
                </div>
                <h4 className="text-[16px] font-bold text-[#F9FAFB] mb-2">{step.title}</h4>
                <p className="text-[14px] text-[#9CA3AF]">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Testimonials
function Testimonials() {
  return (
    <section id="testimonials" className="py-20 bg-[#0F1F3D]">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-[#F9FAFB] tracking-tight">
            Trusted by support teams worldwide
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="bg-[#162240] border border-[#1E3461] rounded-xl p-8 flex flex-col"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-[#F59E0B] text-[#F59E0B]" />
                ))}
              </div>
              <p className="text-[16px] italic text-[#F9FAFB] leading-relaxed mb-6 flex-1">
                "{t.quote}"
              </p>
              <hr className="border-[#1E3461] mb-4" />
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${t.avatarColor} flex items-center justify-center text-white font-semibold text-sm`}>
                  {t.initials}
                </div>
                <div>
                  <p className="text-[15px] font-bold text-[#F9FAFB]">{t.name}</p>
                  <p className="text-[13px] text-[#9CA3AF]">{t.title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Pricing Section
function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);

  const getButtonStyles = (style: string, isPopular?: boolean) => {
    switch (style) {
      case 'blue':
        return 'bg-[#3B82F6] text-white hover:bg-[#1D4ED8]';
      case 'teal':
        return 'bg-[#0F766E] text-white hover:bg-[#0D6358]';
      case 'gray':
        return 'border border-[#6B7280] text-[#9CA3AF] hover:bg-[#1E3461]/50';
      default:
        return 'border border-[#3B82F6] text-[#3B82F6] hover:bg-[#3B82F6]/10';
    }
  };

  return (
    <section id="pricing" className="py-20 bg-[#000D2A]">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-[#F9FAFB] tracking-tight mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-[#9CA3AF] text-lg">
            No per-seat fees. No surprises. Start free, scale as you grow.
          </p>
        </div>

        {/* Toggle */}
        <div className="flex justify-center items-center gap-4 mb-12">
          <span className={`text-sm font-medium ${!isAnnual ? 'text-[#F9FAFB]' : 'text-[#6B7280]'}`}>
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className="w-12 h-6 bg-[#3B82F6] rounded-full relative p-1 transition-colors"
          >
            <div
              className={`w-4 h-4 bg-white rounded-full transition-transform ${
                isAnnual ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${isAnnual ? 'text-[#F9FAFB]' : 'text-[#6B7280]'}`}>
            Annual <span className="text-[#0F766E] text-xs">(-20%)</span>
          </span>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pricingPlans.map((plan) => (
            <div
              key={plan.name}
              className={`bg-[#162240] rounded-xl p-8 relative ${
                plan.isPopular
                  ? 'border-2 border-[#3B82F6] scale-[1.03] shadow-xl shadow-[#3B82F6]/10'
                  : plan.badge
                  ? 'border border-[#0F766E]'
                  : 'border border-[#1E3461]'
              }`}
            >
              {plan.badge && (
                <div
                  className={`absolute -top-3 left-1/2 -translate-x-1/2 ${plan.badgeColor} text-white px-3 py-1 rounded text-[10px] font-bold uppercase`}
                >
                  {plan.badge}
                </div>
              )}

              <p className="font-bold text-[#F9FAFB] mb-2">{plan.name}</p>
              <div className="mb-4">
                {plan.monthlyPrice !== null ? (
                  <p className="text-4xl font-black text-[#F9FAFB]">
                    ${isAnnual ? plan.annualPrice : plan.monthlyPrice}
                    <span className="text-sm font-normal text-[#9CA3AF]">/mo</span>
                  </p>
                ) : (
                  <p className="text-4xl font-black text-[#F9FAFB]">Custom</p>
                )}
              </div>
              <p className="text-[13px] text-[#9CA3AF] mb-6">{plan.subtitle}</p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-[#F9FAFB]">
                    <Check className="w-4 h-4 text-[#3B82F6] flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                to={plan.monthlyPrice !== null ? '/signup' : '/contact'}
                className={`w-full py-3 rounded-lg font-bold flex items-center justify-center transition-colors ${getButtonStyles(
                  plan.buttonStyle,
                  plan.isPopular
                )}`}
              >
                {plan.monthlyPrice !== null ? 'Start Free Trial' : 'Contact Sales'}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-[#6B7280] text-sm mt-8">
          All plans include a 14-day free trial. No credit card required.
        </p>
      </div>
    </section>
  );
}

// Final CTA
function FinalCTA() {
  return (
    <section className="py-20 bg-[#0A1835]">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="bg-gradient-to-br from-[#0F2060] to-[#0F766E]/30 p-12 md:p-16 rounded-2xl border border-[#1E3461] relative overflow-hidden">
          {/* Orbs */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-[#3B82F6]/10 rounded-full blur-[80px]" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-[#0F766E]/10 rounded-full blur-[80px]" />

          <div className="text-center relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold text-[#F9FAFB] tracking-tight mb-4">
              Start automating your support in 15 minutes
            </h2>
            <p className="text-[#9CA3AF] text-lg mb-8">
              Join 500+ support teams already saving hours every day with AI
            </p>

            <div className="flex flex-col sm:flex-row max-w-md mx-auto gap-3 mb-4">
              <input
                type="email"
                placeholder="Enter your work email"
                className="flex-1 bg-[#000D2A] border border-[#1E3461]/40 rounded-xl px-4 py-3 text-sm text-[#F9FAFB] placeholder-[#6B7280] focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent outline-none"
              />
              <button className="bg-[#3B82F6] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#1D4ED8] transition-colors whitespace-nowrap">
                Get Started Free →
              </button>
            </div>

            <p className="text-[13px] text-[#6B7280]">
              No credit card required · 14-day free trial · Cancel anytime
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// Footer
function Footer() {
  const footerLinks = {
    Product: ['Features', 'Pricing', 'Changelog', 'API Docs', 'Status'],
    Company: ['About', 'Blog', 'Careers', 'Press', 'Contact'],
    Legal: ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Security'],
  };

  return (
    <footer className="bg-[#0A1835] border-t border-[#1E3461] py-12">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Logo column */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Mic className="w-5 h-5 text-[#3B82F6]" />
              <span className="text-lg font-bold text-[#F9FAFB]">OmniSupport AI</span>
            </div>
            <p className="text-[#6B7280] text-sm mb-4">
              Your AI Support Team — Voice & Text, Unified
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-[#6B7280] hover:text-[#9CA3AF] transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-[#6B7280] hover:text-[#9CA3AF] transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="#" className="text-[#6B7280] hover:text-[#9CA3AF] transition-colors">
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-[#F9FAFB] font-semibold text-sm uppercase tracking-wider mb-4">
                {title}
              </h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-[#6B7280] hover:text-[#9CA3AF] text-sm transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-[#1E3461]">
          <p className="text-[#6B7280] text-sm text-center">
            © 2026 OmniSupport AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function Landing() {
  useEffect(() => {
    // Load Inter font from Google Fonts
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0A1835] font-['Inter'] antialiased">
      <LandingNav />
      <HeroSection />
      <SocialProofStrip />
      <TwoChannelSection />
      <StatsBar />
      <FeatureGrid />
      <HowItWorks />
      <Testimonials />
      <PricingSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}

import { Link } from 'react-router-dom';
import {
  Sparkles,
  Phone,
  MessageSquare,
  Bot,
  Zap,
  BarChart3,
  Shield,
  Globe,
  Check,
  ArrowRight,
  Play,
  Star,
  ChevronRight,
} from 'lucide-react';

const features = [
  {
    icon: <Phone className="w-6 h-6" />,
    title: 'Voice AI Agent',
    description:
      'Handle inbound calls with natural conversation. Real-time transcription, sentiment detection, and seamless escalation.',
  },
  {
    icon: <MessageSquare className="w-6 h-6" />,
    title: 'Ticket Automation',
    description:
      'Auto-classify, prioritize, and draft responses for email, chat, and helpdesk tickets with human-like accuracy.',
  },
  {
    icon: <Bot className="w-6 h-6" />,
    title: 'RAG Knowledge Base',
    description:
      'Upload PDFs and URLs. Our AI learns your product inside-out and retrieves accurate answers instantly.',
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: 'Smart Workflows',
    description:
      'Build no-code automation rules: route VIP customers, escalate negative sentiment, trigger notifications.',
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: 'Analytics & Insights',
    description:
      'Track resolution rates, cost savings, SLA compliance, and discover knowledge gaps to improve over time.',
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: 'Enterprise Security',
    description:
      'SOC 2 compliant. Data encrypted at rest and in transit. SSO, MFA, and role-based access control.',
  },
];

const pricingPlans = [
  {
    name: 'Starter',
    price: 299,
    period: '/month',
    description: 'Perfect for small teams getting started with AI support',
    features: [
      '500 AI voice minutes/mo',
      '2,000 ticket classifications',
      '5 KB documents',
      'Email support',
      '1 integration',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
  },
  {
    name: 'Professional',
    price: 799,
    period: '/month',
    description: 'For growing teams that need more power and customization',
    features: [
      '2,500 AI voice minutes/mo',
      '10,000 ticket classifications',
      '50 KB documents',
      'Priority support',
      '5 integrations',
      'Custom workflows',
      'SLA monitoring',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: null,
    period: null,
    description: 'For large organizations with custom requirements',
    features: [
      'Unlimited AI voice minutes',
      'Unlimited tickets',
      'Unlimited KB documents',
      'Dedicated support',
      'Unlimited integrations',
      'Custom AI training',
      'On-premise option',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

const testimonials = [
  {
    quote:
      'OmniSupport AI reduced our ticket volume by 70% and our customers love getting instant answers. The ROI was obvious within the first month.',
    author: 'Sarah Chen',
    role: 'VP of Customer Success',
    company: 'TechCorp',
    avatar: 'SC',
  },
  {
    quote:
      'The voice agent handles 80% of our calls autonomously. When it escalates, our agents get full context and can resolve issues in half the time.',
    author: 'Michael Rodriguez',
    role: 'Support Operations Lead',
    company: 'CloudBase',
    avatar: 'MR',
  },
  {
    quote:
      'Setup took 30 minutes. We uploaded our docs, tested a call, and went live. The AI keeps getting smarter from our knowledge base.',
    author: 'Emily Watson',
    role: 'CTO',
    company: 'StartupXYZ',
    avatar: 'EW',
  },
];

const stats = [
  { value: '80%', label: 'Average AI Resolution Rate' },
  { value: '60%', label: 'Reduction in Handle Time' },
  { value: '< 30min', label: 'Time to Go Live' },
  { value: '4.8/5', label: 'Customer Satisfaction' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">OmniSupport AI</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-300 hover:text-white transition-colors">
                Features
              </a>
              <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">
                Pricing
              </a>
              <a href="#testimonials" className="text-gray-300 hover:text-white transition-colors">
                Customers
              </a>
              <Link to="/login" className="text-gray-300 hover:text-white transition-colors">
                Sign In
              </Link>
              <Link
                to="/signup"
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500/10 border border-teal-500/20 rounded-full mb-8">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <span className="text-teal-400 text-sm font-medium">
                Now with GPT-4 Voice Integration
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              AI-Powered Support
              <br />
              <span className="bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
                That Actually Works
              </span>
            </h1>

            <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-10">
              Handle voice calls, tickets, and escalations with intelligent automation. 
              Achieve 80%+ AI resolution rates while your agents focus on what matters.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link
                to="/signup"
                className="w-full sm:w-auto px-8 py-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                Start Free 14-Day Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <button className="w-full sm:w-auto px-8 py-4 border border-gray-600 text-white font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-white/5 transition-colors">
                <Play className="w-5 h-5" />
                Watch Demo
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-gray-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Logos */}
      <section className="py-12 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-gray-500 text-sm mb-8">
            Trusted by innovative support teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-12 opacity-50">
            {['TechCorp', 'CloudBase', 'StartupXYZ', 'DataFlow', 'SecureNet'].map((name) => (
              <div key={name} className="text-2xl font-bold text-gray-400">
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Everything You Need to Scale Support
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              From voice calls to tickets to escalations — one AI platform that handles it all.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-teal-500/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Live in 30 Minutes</h2>
            <p className="text-xl text-gray-400">No code required. No complex setup.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Connect Your Channels',
                description: 'Link your phone number, helpdesk (Zendesk, Freshdesk), and email in minutes.',
              },
              {
                step: '2',
                title: 'Upload Knowledge',
                description: 'Drop PDFs, paste URLs, or connect to Notion. Our AI learns your product instantly.',
              },
              {
                step: '3',
                title: 'Test & Go Live',
                description: 'Make a test call, review the AI responses, and flip the switch to production.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-gray-400">Start free. Scale as you grow.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`p-8 rounded-2xl ${
                  plan.highlighted
                    ? 'bg-gradient-to-b from-teal-500/20 to-slate-800 border-2 border-teal-500 relative'
                    : 'bg-slate-800/50 border border-slate-700'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-teal-500 text-white text-sm font-semibold rounded-full">
                    Most Popular
                  </div>
                )}

                <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
                <div className="mb-4">
                  {plan.price !== null ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">${plan.price}</span>
                      <span className="text-gray-400">{plan.period}</span>
                    </div>
                  ) : (
                    <div className="text-4xl font-bold text-white">Custom</div>
                  )}
                </div>
                <p className="text-gray-400 mb-6">{plan.description}</p>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-gray-300">
                      <Check className="w-5 h-5 text-teal-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  to={plan.price !== null ? '/signup' : '/contact'}
                  className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors ${
                    plan.highlighted
                      ? 'bg-teal-600 hover:bg-teal-700 text-white'
                      : 'border border-gray-600 text-white hover:bg-white/5'
                  }`}
                >
                  {plan.cta}
                  <ChevronRight className="w-5 h-5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Loved by Support Teams</h2>
            <p className="text-xl text-gray-400">See what our customers have to say</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.author}
                className="p-6 bg-slate-800/50 border border-slate-700 rounded-xl"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-300 mb-6 italic">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white font-semibold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="text-white font-medium">{testimonial.author}</div>
                    <div className="text-gray-400 text-sm">
                      {testimonial.role}, {testimonial.company}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-12 bg-gradient-to-r from-teal-600 to-blue-600 rounded-3xl">
            <h2 className="text-4xl font-bold text-white mb-4">
              Ready to Transform Your Support?
            </h2>
            <p className="text-xl text-teal-100 mb-8">
              Start your free 14-day trial today. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/signup"
                className="w-full sm:w-auto px-8 py-4 bg-white text-teal-600 font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                to="/contact"
                className="w-full sm:w-auto px-8 py-4 border-2 border-white text-white font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
              >
                Talk to Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-white">OmniSupport AI</span>
              </div>
              <p className="text-gray-400 text-sm">
                AI-powered customer support that scales with your business.
              </p>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#features" className="hover:text-white">Features</a></li>
                <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                <li><a href="/integrations" className="hover:text-white">Integrations</a></li>
                <li><a href="/changelog" className="hover:text-white">Changelog</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="/about" className="hover:text-white">About</a></li>
                <li><a href="/blog" className="hover:text-white">Blog</a></li>
                <li><a href="/careers" className="hover:text-white">Careers</a></li>
                <li><a href="/contact" className="hover:text-white">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="/privacy" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white">Terms of Service</a></li>
                <li><a href="/security" className="hover:text-white">Security</a></li>
                <li><a href="/gdpr" className="hover:text-white">GDPR</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-400 text-sm">
              © {new Date().getFullYear()} OmniSupport AI. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://twitter.com" className="text-gray-400 hover:text-white">
                <Globe className="w-5 h-5" />
              </a>
              <a href="https://linkedin.com" className="text-gray-400 hover:text-white">
                <Globe className="w-5 h-5" />
              </a>
              <a href="https://github.com" className="text-gray-400 hover:text-white">
                <Globe className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

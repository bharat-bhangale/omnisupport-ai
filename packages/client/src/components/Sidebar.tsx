import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Phone,
  Ticket,
  AlertTriangle,
  BookOpen,
  BarChart3,
  Bot,
  Plug,
  Settings,
  Zap,
  Lightbulb,
  Shield,
  ClipboardCheck,
  Clock,
  Users,
  Globe,
  TrendingUp,
  LogOut,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number | string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: 'Core',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
      { label: 'Live Calls', path: '/calls', icon: <Phone className="w-5 h-5" /> },
      { label: 'Tickets', path: '/tickets', icon: <Ticket className="w-5 h-5" /> },
      { label: 'Escalations', path: '/escalations', icon: <AlertTriangle className="w-5 h-5" /> },
    ],
  },
  {
    title: 'Knowledge & AI',
    items: [
      { label: 'Knowledge Base', path: '/knowledge-base', icon: <BookOpen className="w-5 h-5" /> },
      { label: 'AI Config', path: '/agent-config', icon: <Bot className="w-5 h-5" /> },
      { label: 'Workflows', path: '/workflows', icon: <Zap className="w-5 h-5" /> },
      { label: 'Learning Hub', path: '/learning', icon: <Lightbulb className="w-5 h-5" /> },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { label: 'Analytics', path: '/analytics', icon: <BarChart3 className="w-5 h-5" /> },
      { label: 'SLA Monitor', path: '/sla', icon: <Clock className="w-5 h-5" /> },
      { label: 'QA Dashboard', path: '/qa', icon: <ClipboardCheck className="w-5 h-5" /> },
      { label: 'Agent Stats', path: '/agent-stats', icon: <Users className="w-5 h-5" /> },
      { label: 'Fraud Detection', path: '/fraud', icon: <Shield className="w-5 h-5" /> },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Integrations', path: '/integrations', icon: <Plug className="w-5 h-5" /> },
      { label: 'Languages', path: '/languages', icon: <Globe className="w-5 h-5" /> },
      { label: 'Proactive', path: '/proactive', icon: <TrendingUp className="w-5 h-5" /> },
      { label: 'Settings', path: '/settings', icon: <Settings className="w-5 h-5" /> },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('company_id');
    localStorage.removeItem('user_id');
    navigate('/login');
  };

  // Get user info from localStorage
  const userName = localStorage.getItem('user_name') || 'Support Agent';
  const userEmail = localStorage.getItem('user_email') || 'agent@company.com';
  const companyName = localStorage.getItem('company_name') || 'OmniSupport';

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-[#0F1F3D] text-white flex flex-col z-40">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-[#1E3461]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0F766E] to-[#3B82F6] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#F9FAFB]">OmniSupport</h1>
            <p className="text-xs text-[#6B7280]">AI-Powered Support</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navigation.map((section) => (
          <div key={section.title} className="mb-4">
            <button
              onClick={() => toggleSection(section.title)}
              className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-[#6B7280] uppercase tracking-wider hover:text-[#9CA3AF]"
            >
              <span>{section.title}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  collapsedSections.has(section.title) ? '-rotate-90' : ''
                }`}
              />
            </button>

            {!collapsedSections.has(section.title) && (
              <div className="mt-1 space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-[#3B82F6] text-white'
                          : 'text-[#9CA3AF] hover:bg-[#1E3461] hover:text-[#F9FAFB]'
                      }`
                    }
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-red-500 text-white rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div className="px-3 py-4 border-t border-[#1E3461]">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1E3461] transition-colors">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center text-sm font-semibold">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#F9FAFB] truncate">{userName}</p>
            <p className="text-xs text-[#6B7280] truncate">{companyName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-[#6B7280] hover:text-[#F9FAFB] hover:bg-[#162240] rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

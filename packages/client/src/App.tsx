import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { store } from './store';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

// Auth Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import MFA from './pages/MFA';

// Main App Pages
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import CallMonitor from './pages/CallMonitor';
import TicketQueue from './pages/TicketQueue';
import TicketDetail from './pages/TicketDetail';
import Escalations from './pages/Escalations';
import KnowledgeBase from './pages/KnowledgeBase';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import AgentConfig from './pages/AgentConfig';
import Integrations from './pages/Integrations';
import Settings from './pages/Settings';
import CustomerProfile from './pages/CustomerProfile';
import WorkflowBuilder from './pages/WorkflowBuilder';
import LearningInsights from './pages/LearningInsights';

// Additional Pages
import FraudDashboard from './pages/FraudDashboard';
import QADashboard from './pages/QADashboard';
import QARubricConfig from './pages/QARubricConfig';
import SLADashboard from './pages/SLADashboard';
import AgentStats from './pages/AgentStats';
import LanguageSettings from './pages/LanguageSettings';
import ProactiveTriggers from './pages/ProactiveTriggers';

// Auth guard hook
function useAuth(): { isAuthenticated: boolean; isLoading: boolean } {
  const token = localStorage.getItem('auth_token');
  return { isAuthenticated: !!token, isLoading: false };
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Public route wrapper (redirects to dashboard if already logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1F2937',
              color: '#F9FAFB',
              borderRadius: '8px',
            },
            success: {
              iconTheme: {
                primary: '#10B981',
                secondary: '#F9FAFB',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#F9FAFB',
              },
            },
          }}
        />

        <Routes>
          {/* Public Routes */}
          <Route
            path="/"
            element={
              <PublicRoute>
                <Landing />
              </PublicRoute>
            }
          />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <SignUp />
              </PublicRoute>
            }
          />
          <Route
            path="/mfa"
            element={
              <PublicRoute>
                <MFA />
              </PublicRoute>
            }
          />

          {/* Onboarding (protected but no sidebar) */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />

          {/* Protected Routes with Layout */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/calls"
            element={
              <ProtectedRoute>
                <Layout>
                  <CallMonitor />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tickets"
            element={
              <ProtectedRoute>
                <Layout>
                  <TicketQueue />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tickets/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <TicketDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/escalations"
            element={
              <ProtectedRoute>
                <Layout>
                  <Escalations />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/knowledge-base"
            element={
              <ProtectedRoute>
                <Layout>
                  <KnowledgeBase />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Layout>
                  <AnalyticsDashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/agent-config"
            element={
              <ProtectedRoute>
                <Layout>
                  <AgentConfig />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/integrations"
            element={
              <ProtectedRoute>
                <Layout>
                  <Integrations />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <CustomerProfile />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/workflows"
            element={
              <ProtectedRoute>
                <Layout>
                  <WorkflowBuilder />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/learning"
            element={
              <ProtectedRoute>
                <Layout>
                  <LearningInsights />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Additional Pages */}
          <Route
            path="/fraud"
            element={
              <ProtectedRoute>
                <Layout>
                  <FraudDashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/qa"
            element={
              <ProtectedRoute>
                <Layout>
                  <QADashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/qa/rubric"
            element={
              <ProtectedRoute>
                <Layout>
                  <QARubricConfig />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sla"
            element={
              <ProtectedRoute>
                <Layout>
                  <SLADashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/agent-stats"
            element={
              <ProtectedRoute>
                <Layout>
                  <AgentStats />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/languages"
            element={
              <ProtectedRoute>
                <Layout>
                  <LanguageSettings />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/proactive"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProactiveTriggers />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </Provider>
    </ErrorBoundary>
  );
}

import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';

import { PageLayout } from '@/components/layout/PageLayout';
import { Toaster } from '@/components/ui/toaster';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// Pages
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Onboarding from '@/pages/Onboarding';
import Dashboard from '@/pages/Dashboard';
import AgentsList from '@/pages/AgentsList';
import AgentOverview from '@/pages/AgentOverview';
import KnowledgeBase from '@/pages/KnowledgeBase';
import CallLog from '@/pages/CallLog';
import CallDetail from '@/pages/CallDetail';
import CalendarPage from '@/pages/Calendar';
import PhoneNumbers from '@/pages/PhoneNumbers';
import Analytics from '@/pages/Analytics';
import Integrations from '@/pages/Integrations';
import AccountSettings from '@/pages/settings/Account';
import TeamSettings from '@/pages/settings/Team';
import BillingSettings from '@/pages/settings/Billing';
import ApiKeysSettings from '@/pages/settings/ApiKeys';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuthStore();
  if (loading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Redirect logged-in users away from /login and /signup
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, org } = useAuthStore();
  if (loading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>;
  if (session) {
    // If they have no org yet, send to onboarding; otherwise dashboard
    return <Navigate to={org ? '/dashboard' : '/onboarding'} replace />;
  }
  return <>{children}</>;
}

// Handles Supabase OAuth redirect — the hash contains the session token
function OAuthCallback() {
  const navigate = useNavigate();
  const { session, loading, org } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    // Supabase processes the hash automatically via onAuthStateChange.
    // We just wait for loading to finish then redirect.
    if (!loading) {
      if (session) {
        navigate(org ? '/dashboard' : '/onboarding', { replace: true });
      } else {
        // Something went wrong
        navigate('/login', { replace: true });
      }
    }
  }, [loading, session, org, navigate, location]);

  return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>;
}

function AppRoutes() {
  return (
    <AnimatePresence mode="wait">
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/signup" element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />

        {/* OAuth callback — Supabase redirects here after Google sign-in */}
        <Route path="/auth/callback" element={<OAuthCallback />} />

        {/* Onboarding (protected, no sidebar) */}
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

        {/* Authenticated with sidebar */}
        <Route element={<ProtectedRoute><PageLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/agents" element={<AgentsList />} />
          <Route path="/agents/:id" element={<AgentOverview />} />
          <Route path="/knowledge/:id" element={<KnowledgeBase />} />
          <Route path="/calls" element={<CallLog />} />
          <Route path="/calls/:id" element={<CallDetail />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/numbers" element={<PhoneNumbers />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/settings" element={<AccountSettings />} />
          <Route path="/settings/team" element={<TeamSettings />} />
          <Route path="/settings/billing" element={<BillingSettings />} />
          <Route path="/settings/api" element={<ApiKeysSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  const { initialize } = useAuthStore();
  const { theme } = useUIStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

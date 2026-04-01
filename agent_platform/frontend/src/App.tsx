import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';

import { PageLayout } from '@/components/layout/PageLayout';
import { Toaster } from '@/components/ui/toaster';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { auth } from '@/lib/supabase';

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
import AcceptInvite from '@/pages/AcceptInvite';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env ?? {};
const API_URL: string = env.VITE_API_URL ?? '';
const HEALTH_POLL_INTERVAL_MS = 5000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children, requireOrg = false }: { children: React.ReactNode; requireOrg?: boolean }) {
  const { session, loading, org, initialized } = useAuthStore();

  if (loading || !initialized) {
    return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (requireOrg && !org) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, initialized, org } = useAuthStore();

  if (loading || !initialized) {
    return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>;
  }
  if (session) {
    return <Navigate to={org ? '/dashboard' : '/onboarding'} replace />;
  }

  return <>{children}</>;
}

function OAuthCallback() {
  const navigate = useNavigate();
  const { session, loading, org } = useAuthStore();
  const location = useLocation();
  const [exchangeDone, setExchangeDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function finishOAuthRedirect() {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const errorDescription = params.get('error_description') || params.get('error');

      if (errorDescription) {
        if (!cancelled) {
          navigate('/login', {
            replace: true,
            state: { authError: errorDescription },
          });
        }
        return;
      }

      if (code) {
        const { error } = await auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) {
            navigate('/login', {
              replace: true,
              state: { authError: error.message },
            });
          }
          return;
        }
      }

      if (!cancelled) {
        setExchangeDone(true);
      }
    }

    void finishOAuthRedirect();

    return () => {
      cancelled = true;
    };
  }, [location.search, navigate]);

  useEffect(() => {
    if (!exchangeDone || loading) return;

    if (session) {
      navigate(org ? '/dashboard' : '/onboarding', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [exchangeDone, loading, session, org, navigate]);

  return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>;
}

function ReconnectionBanner() {
  const { isServerUnreachable, initialize, initialized } = useAuthStore();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isServerUnreachable) {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/health`, { method: 'GET' });
        if (res.ok) {
          const state = useAuthStore.getState();
          state.setServerUnreachable(false);

          if (!initialized || !state.session || !state.org) {
            await initialize();
          }
        }
      } catch {
        // Keep polling until the backend is reachable again.
      }
    }, HEALTH_POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [initialize, initialized, isServerUnreachable]);

  if (!isServerUnreachable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-yellow-500/90 backdrop-blur-sm px-4 py-2 text-sm font-medium text-yellow-950"
    >
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-900/60" />
      Reconnecting to server...
    </div>
  );
}

function AppRoutes() {
  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/signup" element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />
        <Route path="/auth/callback" element={<OAuthCallback />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

        <Route element={<ProtectedRoute requireOrg><PageLayout /></ProtectedRoute>}>
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
    void initialize();
  }, [initialize]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ReconnectionBanner />
        <AppRoutes />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

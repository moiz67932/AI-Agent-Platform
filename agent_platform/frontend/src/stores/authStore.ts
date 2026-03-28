import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Organization, User } from '@/types';
import { supabase, auth } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env ?? {};
const API_URL: string = env.VITE_API_URL ?? '';

// Module-level guards prevent duplicate init/listeners in React StrictMode.
let _initStarted = false;
let _authSubscription: { unsubscribe: () => void } | null = null;

interface AuthProfileResponse {
  data: {
    user: {
      id: string;
      email: string;
      full_name: string;
      avatar_url?: string | null;
    };
    org: Organization | null;
    role: User['role'] | null;
    onboarding_completed: boolean;
  };
}

async function loadUserProfileFromTables(userId: string): Promise<{ org: Organization | null; role: User['role'] }> {
  let org: Organization | null = null;
  let role: User['role'] = 'owner';

  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('owner_id', userId)
    .limit(1);
  if (orgError) throw orgError;

  org = orgs?.[0] ?? null;

  if (!org) {
    const { data: memberships, error: membershipError } = await supabase
      .from('team_members')
      .select('organization_id, role')
      .eq('user_id', userId)
      .not('joined_at', 'is', null)
      .limit(1);
    if (membershipError) throw membershipError;

    const membership = memberships?.[0] ?? null;
    if (membership) {
      role = membership.role as User['role'];

      const { data: memberOrgs, error: memberOrgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', membership.organization_id)
        .limit(1);
      if (memberOrgError) throw memberOrgError;

      org = memberOrgs?.[0] ?? null;
    }
  }

  return { org, role };
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed')
  );
}

interface AuthState {
  user: User | null;
  session: Session | null;
  org: Organization | null;
  loading: boolean;
  initialized: boolean;
  isServerUnreachable: boolean;
  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setOrg: (org: Organization | null) => void;
  setServerUnreachable: (val: boolean) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
  loadUserProfile: (
    sessionUser: { id: string; email?: string; user_metadata?: Record<string, unknown> },
    accessToken?: string
  ) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  org: null,
  loading: true,
  initialized: false,
  isServerUnreachable: false,

  setSession: (session) => set({ session }),
  setUser: (user) => set({ user }),
  setOrg: (org) => set({ org }),
  setServerUnreachable: (val) => set({ isServerUnreachable: val }),

  loadUserProfile: async (sessionUser, accessToken) => {
    let org: Organization | null = null;
    let role: User['role'] = 'owner';

    try {
      if (accessToken && API_URL) {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Profile request failed: ${response.status}`);
        }

        const body = (await response.json()) as AuthProfileResponse;
        org = body.data.org;
        role = body.data.role ?? 'owner';

        if (get().isServerUnreachable) {
          set({ isServerUnreachable: false });
        }
      } else {
        const profile = await loadUserProfileFromTables(sessionUser.id);
        org = profile.org;
        role = profile.role;
      }
    } catch (err) {
      console.warn('Could not load auth profile from API, falling back to direct queries:', err);

      if (isNetworkError(err)) {
        set({ isServerUnreachable: true });
      }

      try {
        const profile = await loadUserProfileFromTables(sessionUser.id);
        org = profile.org;
        role = profile.role;
      } catch (fallbackErr) {
        console.warn('Could not load org via fallback queries:', fallbackErr);
      }
    }

    set({
      user: {
        id: sessionUser.id,
        email: sessionUser.email || '',
        full_name: (sessionUser.user_metadata?.full_name as string) || sessionUser.email || '',
        avatar_url: sessionUser.user_metadata?.avatar_url as string | undefined,
        organization_id: org?.id,
        role,
      },
      org,
    });
  },

  signOut: async () => {
    // scope: 'local' clears the local token without a network call.
    try {
      await auth.signOut({ scope: 'local' });
    } catch (err) {
      console.warn('signOut error (clearing local state anyway):', err);
    }

    _initStarted = false;
    _authSubscription?.unsubscribe();
    _authSubscription = null;

    set({ user: null, session: null, org: null, loading: false, initialized: true });
    window.location.href = '/login';
  },

  initialize: async () => {
    const shouldRetryHydration = get().initialized && !!get().session && !get().org;
    if (_initStarted && !shouldRetryHydration) return;
    _initStarted = true;

    const hydrateFromSession = async (session: Session | null) => {
      if (!session?.user) {
        set({ session: null, user: null, org: null, loading: false, initialized: true });
        return;
      }

      set({ session, loading: true });

      try {
        await get().loadUserProfile(session.user, session.access_token);
      } catch (err) {
        console.warn('loadUserProfile error while hydrating auth state:', err);
      }

      set({ loading: false, initialized: true });
    };

    _authSubscription?.unsubscribe();
    const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        set({ session: null, user: null, org: null, loading: false, initialized: true });
        return;
      }

      await hydrateFromSession(session);
    });
    _authSubscription = subscription;

    const safetyTimer = setTimeout(() => {
      if (get().loading) {
        console.warn('Auth init safety timeout, forcing loading: false');
        set({ loading: false, initialized: true });
      }
    }, 3000);

    try {
      const { data: { session } } = await auth.getSession();
      clearTimeout(safetyTimer);

      if (!get().initialized) {
        await hydrateFromSession(session);
      }
    } catch (err) {
      console.error('getSession error:', err);
      clearTimeout(safetyTimer);
      set({ loading: false, initialized: true });
    }
  },
}));

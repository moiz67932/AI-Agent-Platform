import { create } from 'zustand';
import type { Organization, User } from '@/types';
import { supabase, auth } from '@/lib/supabase';

// Module-level flag prevents double-initialization in React StrictMode
let _initStarted = false;

interface AuthState {
  user: User | null;
  session: Record<string, unknown> | null;
  org: Organization | null;
  loading: boolean;
  initialized: boolean;
  setSession: (session: Record<string, unknown> | null) => void;
  setUser: (user: User | null) => void;
  setOrg: (org: Organization | null) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
  loadUserProfile: (sessionUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  org: null,
  loading: true,
  initialized: false,

  setSession: (session) => set({ session }),
  setUser: (user) => set({ user }),
  setOrg: (org) => set({ org }),

  loadUserProfile: async (sessionUser) => {
    let org = null;
    let role: User['role'] = 'owner';
    try {
      // First: check if owner
      const { data: orgs } = await supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', sessionUser.id)
        .limit(1);
      org = orgs?.[0] ?? null;

      // Second: check team_members if not owner
      if (!org) {
        const { data: memberships } = await supabase
          .from('team_members')
          .select('organization_id, role')
          .eq('user_id', sessionUser.id)
          .not('joined_at', 'is', null)
          .limit(1);
        const membership = memberships?.[0] ?? null;
        if (membership) {
          const { data: memberOrgs } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', membership.organization_id)
            .limit(1);
          org = memberOrgs?.[0] ?? null;
          role = membership.role as User['role'];
        }
      }
    } catch (err) {
      console.warn('Could not load org:', err);
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
    try {
      await auth.signOut();
    } catch (err) {
      console.warn('signOut error (clearing local state anyway):', err);
    }
    _initStarted = false;
    set({ user: null, session: null, org: null, loading: false, initialized: true });
    window.location.href = '/login';
  },

  initialize: async () => {
    if (_initStarted) return;
    _initStarted = true;

    // Safety timeout: if Supabase never responds, unblock the UI after 5s
    const safetyTimer = setTimeout(() => {
      if (get().loading) {
        console.warn('Auth init timed out — forcing loading: false');
        set({ loading: false, initialized: true });
      }
    }, 5000);

    // Listen for auth state changes (handles OAuth redirects)
    // Only clear state on an explicit SIGNED_OUT event — never on a transient null session
    // (e.g. page visibility changes, network blips, or back-navigation bfcache restores).
    auth.onAuthStateChange(async (event: string, session: Record<string, unknown> | null) => {
      if (event === 'SIGNED_OUT') {
        set({ session: null, user: null, org: null, loading: false, initialized: true });
        return;
      }

      if (session && (session as { user?: unknown }).user) {
        set({ session });
        try {
          await get().loadUserProfile((session as { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } }).user);
        } catch (err) {
          console.warn('loadUserProfile error in onAuthStateChange:', err);
        }
        set({ loading: false, initialized: true });
      }
      // For any other event with no session, do nothing — getSession() below is the source of truth.
    });

    try {
      const { data: { session } } = await auth.getSession();
      if (session?.user) {
        set({ session });
        try {
          await get().loadUserProfile(session.user);
        } catch (err) {
          console.warn('loadUserProfile error on init:', err);
        }
      }
    } catch (err) {
      console.error('Auth init error:', err);
    } finally {
      clearTimeout(safetyTimer);
      set({ loading: false, initialized: true });
    }
  },
}));

import { auth } from './supabase';
import { useAuthStore } from '@/stores/authStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env ?? {};
const API_URL: string = env.VITE_API_URL ?? '';

/** Returns true if the error looks like a network / connection failure (not a 4xx/5xx). */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('err_connection_refused') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') // Safari
  );
}

/**
 * Wait for auth initialization to complete before returning headers.
 * This prevents requests from going out with no token on page reload,
 * when the Supabase client hasn't yet restored the session from localStorage.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  // If auth is still initializing, wait for it (up to 10s)
  const store = useAuthStore.getState();
  if (!store.initialized) {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        unsub();
        resolve();
      }, 10_000);
      const unsub = useAuthStore.subscribe((state) => {
        if (state.initialized) {
          clearTimeout(timeout);
          unsub();
          resolve();
        }
      });
    });
  }

  const { data } = await auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (data?.session?.access_token) {
    headers['Authorization'] = `Bearer ${data.session.access_token}`;
  }
  return headers;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });
  } catch (err) {
    // fetch() itself threw — this is a network-level failure (no response at all).
    useAuthStore.getState().setServerUnreachable(true);
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  // A successful response means the server is reachable again.
  if (useAuthStore.getState().isServerUnreachable) {
    useAuthStore.getState().setServerUnreachable(false);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const headers = await getAuthHeaders();
    // Remove Content-Type so the browser sets multipart boundary correctly
    delete (headers as Record<string, string>)['Content-Type'];
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch (err) {
      useAuthStore.getState().setServerUnreachable(true);
      throw err;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Upload failed: ${res.status}`);
    }
    if (useAuthStore.getState().isServerUnreachable) {
      useAuthStore.getState().setServerUnreachable(false);
    }
    return res.json();
  },
};

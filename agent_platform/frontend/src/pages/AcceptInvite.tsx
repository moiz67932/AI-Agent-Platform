import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/authStore';

const API = import.meta.env.VITE_API_URL || '';

interface InviteInfo {
  email: string;
  organization_name: string;
  role: string;
  token: string;
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const token = searchParams.get('token') || '';

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('No invite token found in URL.');
      setLoading(false);
      return;
    }
    fetch(`${API}/api/team/accept?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Invalid invite');
        setInviteInfo(body);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const body: Record<string, string> = { token };
      if (!session) body.password = password;

      const res = await fetch(`${API}/api/team/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept invite');
      setDone(true);
      // Redirect to login (new users) or dashboard (existing logged-in users)
      setTimeout(() => navigate(session ? '/dashboard' : '/login', { replace: true }), 2000);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-dash-blue" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-red-500 font-medium">{loadError}</p>
            <p className="text-sm text-dash-t3">This invite may have expired or already been used.</p>
            <Button variant="outline" onClick={() => navigate('/login')}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-semibold text-dash-t1">You're in!</h2>
            <p className="text-dash-t3 text-sm">Redirecting you now...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Team Invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-dash-surface border border-dash-border p-4 space-y-2">
            <p className="text-sm text-dash-t3">You've been invited to join</p>
            <p className="font-semibold text-lg text-dash-t1">{inviteInfo?.organization_name}</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-dash-t3">as</span>
              <Badge variant="secondary" className="capitalize">{inviteInfo?.role}</Badge>
            </div>
          </div>

          {!session && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={inviteInfo?.email || ''} disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Create a password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                />
              </div>
            </div>
          )}

          {session && (
            <p className="text-sm text-dash-t3">
              You're logged in as <strong>{(session as { user?: { email?: string } })?.user?.email}</strong>.
              Click below to accept the invitation.
            </p>
          )}

          {submitError && <p className="text-sm text-red-500">{submitError}</p>}

          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={submitting || (!session && password.length < 8)}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Accept Invitation
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { auth } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    const authError = (location.state as { authError?: string } | null)?.authError;
    if (!authError) return;
    toast({ title: 'Authentication error', description: authError, variant: 'destructive' });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  async function onSubmit(values: LoginValues) {
    setIsLoading(true);
    const { error } = await auth.signInWithPassword({ email: values.email, password: values.password });
    if (error) {
      setIsLoading(false);
      const msg = error.message.includes('Email not confirmed')
        ? 'Please check your email and click the confirmation link before signing in.'
        : error.message.includes('Invalid login credentials')
        ? 'Incorrect email or password.'
        : error.message;
      toast({ title: 'Sign in failed', description: msg, variant: 'destructive' });
    }
  }

  async function handleGoogleSignIn() {
    setIsGoogleLoading(true);
    const { error } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) { setIsGoogleLoading(false); toast({ title: 'Google sign in failed', description: error.message, variant: 'destructive' }); }
  }

  async function handleForgotPassword() {
    if (!forgotEmail || !/\S+@\S+\.\S+/.test(forgotEmail)) { toast({ title: 'Enter a valid email', variant: 'destructive' }); return; }
    setForgotLoading(true);
    const { error } = await auth.resetPasswordForEmail(forgotEmail, { redirectTo: `${window.location.origin}/auth/callback?type=recovery` });
    setForgotLoading(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setForgotSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-foyer-bg px-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-foyer-t1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <span className="font-display text-xl italic text-foyer-t1">Foyer</span>
        </div>

        <div className="rounded-2xl border border-foyer-border bg-foyer-surface p-8">
          <h1 className="text-xl font-extrabold text-foyer-t1 text-center">Welcome back</h1>
          <p className="text-sm text-foyer-t2 text-center mt-1">Sign in to your account</p>

          {/* Google */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full flex items-center justify-center gap-2 mt-6 text-sm font-semibold text-foyer-t1 border border-foyer-border rounded-xl py-2.5 hover:border-foyer-border2 transition-colors disabled:opacity-50"
          >
            {isGoogleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-foyer-border" />
            <span className="text-[10px] text-foyer-t3 font-medium">OR</span>
            <div className="flex-1 h-px bg-foyer-border" />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foyer-t2">Email</label>
              <input {...register('email')} type="email" placeholder="you@example.com" className="w-full text-sm text-foyer-t1 bg-foyer-surface2 border border-foyer-border rounded-xl px-3 py-2.5 outline-none focus:border-foyer-blue transition-colors placeholder:text-foyer-t3" />
              {errors.email && <p className="text-[10px] text-foyer-red">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foyer-t2">Password</label>
                <button type="button" onClick={() => setShowForgot(true)} className="text-[10px] text-foyer-blue font-medium hover:underline">Forgot?</button>
              </div>
              <div className="relative">
                <input {...register('password')} type={showPassword ? 'text' : 'password'} placeholder="••••••••" className="w-full text-sm text-foyer-t1 bg-foyer-surface2 border border-foyer-border rounded-xl px-3 py-2.5 pr-10 outline-none focus:border-foyer-blue transition-colors placeholder:text-foyer-t3" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-foyer-t3 hover:text-foyer-t2">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-[10px] text-foyer-red">{errors.password.message}</p>}
            </div>
            <button type="submit" disabled={isLoading} className="w-full text-sm font-semibold bg-foyer-t1 text-foyer-surface py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>

          <p className="text-xs text-foyer-t3 text-center mt-5">
            Don&apos;t have an account? <Link to="/signup" className="text-foyer-blue font-semibold hover:underline">Sign up</Link>
          </p>
        </div>
      </div>

      {/* Forgot password dialog */}
      <Dialog open={showForgot} onOpenChange={setShowForgot}>
        <DialogContent className="bg-foyer-surface border-foyer-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foyer-t1">Reset password</DialogTitle>
            <DialogDescription className="text-foyer-t2">{forgotSent ? 'Check your email for a reset link.' : 'Enter your email and we\'ll send a reset link.'}</DialogDescription>
          </DialogHeader>
          {!forgotSent && (
            <input value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@example.com" className="w-full text-sm text-foyer-t1 bg-foyer-surface2 border border-foyer-border rounded-xl px-3 py-2.5 outline-none focus:border-foyer-blue transition-colors" />
          )}
          <DialogFooter>
            <button onClick={() => { setShowForgot(false); setForgotSent(false); }} className="text-xs font-semibold px-4 py-2 rounded-lg border border-foyer-border text-foyer-t2">Close</button>
            {!forgotSent && (
              <button onClick={handleForgotPassword} disabled={forgotLoading} className="text-xs font-semibold px-4 py-2 rounded-lg bg-foyer-t1 text-foyer-surface hover:opacity-90 disabled:opacity-50">
                {forgotLoading ? 'Sending...' : 'Send reset link'}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Loader2, Eye, EyeOff, Phone, Calendar, BarChart3, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { auth } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginValues) {
    setIsLoading(true);
    const { error } = await auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    setIsLoading(false);

    if (error) {
      const msg = error.message.includes('Email not confirmed')
        ? 'Please check your email and click the confirmation link before signing in.'
        : error.message.includes('Invalid login credentials')
        ? 'Incorrect email or password. Please try again.'
        : error.message;

      toast({ title: 'Sign in failed', description: msg, variant: 'destructive' });
      return;
    }

    navigate('/dashboard');
  }

  async function handleGoogleSignIn() {
    setIsGoogleLoading(true);
    const { error } = await auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setIsGoogleLoading(false);
      toast({ title: 'Google sign in failed', description: error.message, variant: 'destructive' });
    }
    // If no error, browser redirects to Google — don't setIsGoogleLoading(false)
  }

  async function handleForgotPassword() {
    if (!forgotEmail || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      toast({ title: 'Enter a valid email address', variant: 'destructive' });
      return;
    }
    setForgotLoading(true);
    const { error } = await auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    setForgotLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setForgotSent(true);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-card p-10 lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Phone className="h-6 w-6 text-primary" />
            <span>VoiceAI</span>
          </div>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-md">
          <div className="rounded-xl border border-border/50 bg-background/50 p-5 shadow-2xl backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
              <span className="ml-2 text-xs text-muted-foreground">VoiceAI Dashboard</span>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-3">
              {[
                { label: 'Calls Today', value: '48' },
                { label: 'Bookings', value: '12' },
                { label: 'Avg Duration', value: '2m 34s' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border/40 bg-card p-3 text-center">
                  <p className="text-lg font-semibold">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-1 rounded-lg border border-border/40 bg-card p-3">
              <BarChart3 className="mr-2 h-4 w-4 text-muted-foreground" />
              {[40, 65, 45, 80, 55, 70, 90, 60, 75, 85, 50, 95].map((h, i) => (
                <div key={i} className="flex-1 rounded-sm bg-primary/60" style={{ height: `${h * 0.5}px` }} />
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {['Sarah M. - Cleaning', 'James R. - Consultation', 'Priya K. - Follow-up'].map((c) => (
                <div key={c} className="flex items-center gap-2 rounded-md border border-border/30 bg-card px-3 py-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 text-primary/70" />
                  {c}
                  <span className="ml-auto text-[10px] text-green-500">Booked</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <blockquote className="space-y-2">
            <Quote className="h-5 w-5 text-primary/60" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              &ldquo;VoiceAI cut our missed calls by 80% in the first month. Patients love that
              they can book appointments any time of day without waiting on hold.&rdquo;
            </p>
            <footer className="text-sm font-medium">
              Dr. Emily Chen{' '}
              <span className="font-normal text-muted-foreground">&mdash; Bright Smile Dental</span>
            </footer>
          </blockquote>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-sm space-y-6"
        >
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight lg:hidden">
            <Phone className="h-6 w-6 text-primary" />
            <span>VoiceAI</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                {...register('email')}
                className={cn(errors.email && 'border-destructive')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  {...register('password')}
                  className={cn('pr-10', errors.password && 'border-destructive')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isGoogleLoading}>
            {isGoogleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            Continue with Google
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">Sign up</Link>
          </p>
        </motion.div>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgot} onOpenChange={(o) => { setShowForgot(o); if (!o) { setForgotSent(false); setForgotEmail(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              {forgotSent
                ? 'Check your email for a password reset link. It may take a minute to arrive.'
                : "Enter your account email and we'll send you a reset link."}
            </DialogDescription>
          </DialogHeader>
          {!forgotSent && (
            <div className="space-y-3 py-2">
              <Label htmlFor="forgot-email">Email address</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@example.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
              />
            </div>
          )}
          <DialogFooter>
            {forgotSent ? (
              <Button onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowForgot(false)}>Cancel</Button>
                <Button onClick={handleForgotPassword} disabled={forgotLoading}>
                  {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

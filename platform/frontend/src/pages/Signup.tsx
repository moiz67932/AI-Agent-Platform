import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Loader2, Eye, EyeOff, Phone, Calendar, BarChart3, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { auth } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

/* -------------------------------------------------------------------------- */
/*  Schema                                                                    */
/* -------------------------------------------------------------------------- */

const signupSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type SignupValues = z.infer<typeof signupSchema>;

/* -------------------------------------------------------------------------- */
/*  Password strength helper                                                  */
/* -------------------------------------------------------------------------- */

function getStrength(password: string): { label: string; color: string; width: string } {
  const len = password.length;
  if (len === 0) return { label: '', color: 'bg-muted', width: '0%' };
  if (len < 8) return { label: 'Weak', color: 'bg-red-500', width: '33%' };
  if (len < 12) return { label: 'Fair', color: 'bg-yellow-500', width: '66%' };
  return { label: 'Strong', color: 'bg-green-500', width: '100%' };
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function Signup() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  const passwordValue = watch('password');
  const strength = useMemo(() => getStrength(passwordValue), [passwordValue]);

  /* ---- handler ---- */

  async function onSubmit(values: SignupValues) {
    setIsLoading(true);
    const { error } = await auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { full_name: values.fullName } },
    });
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Sign up failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    navigate('/onboarding');
  }

  /* ---- render ---- */

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ------------------------------------------------------------------ */}
      {/*  Left brand panel                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-card p-10 lg:flex">
        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />

        <div className="relative z-10">
          {/* logo */}
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Phone className="h-6 w-6 text-primary" />
            <span>VoiceAI</span>
          </div>
        </div>

        {/* product screenshot mockup */}
        <div className="relative z-10 mx-auto w-full max-w-md">
          <div className="rounded-xl border border-border/50 bg-background/50 p-5 shadow-2xl backdrop-blur-sm">
            {/* mock header */}
            <div className="mb-4 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
              <span className="ml-2 text-xs text-muted-foreground">VoiceAI Dashboard</span>
            </div>

            {/* mock stat row */}
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

            {/* mock chart placeholder */}
            <div className="flex items-end gap-1 rounded-lg border border-border/40 bg-card p-3">
              <BarChart3 className="mr-2 h-4 w-4 text-muted-foreground" />
              {[40, 65, 45, 80, 55, 70, 90, 60, 75, 85, 50, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-primary/60"
                  style={{ height: `${h * 0.5}px` }}
                />
              ))}
            </div>

            {/* mock recent calls */}
            <div className="mt-4 space-y-2">
              {['Sarah M. - Cleaning', 'James R. - Consultation', 'Priya K. - Follow-up'].map(
                (c) => (
                  <div
                    key={c}
                    className="flex items-center gap-2 rounded-md border border-border/30 bg-card px-3 py-2 text-xs text-muted-foreground"
                  >
                    <Calendar className="h-3 w-3 text-primary/70" />
                    {c}
                    <span className="ml-auto text-[10px] text-green-500">Booked</span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* testimonial */}
        <div className="relative z-10">
          <blockquote className="space-y-2">
            <Quote className="h-5 w-5 text-primary/60" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              &ldquo;Setting up VoiceAI took us 10 minutes. Within a week our front desk staff
              could focus on in-office patients while the AI handled every phone inquiry.&rdquo;
            </p>
            <footer className="text-sm font-medium">
              Marcus Rivera{' '}
              <span className="font-normal text-muted-foreground">
                &mdash; Peak Performance HVAC
              </span>
            </footer>
          </blockquote>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  Right form panel                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-sm space-y-6"
        >
          {/* mobile logo */}
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight lg:hidden">
            <Phone className="h-6 w-6 text-primary" />
            <span>VoiceAI</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Get started with VoiceAI in minutes
            </p>
          </div>

          {/* form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* full name */}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Jane Smith"
                autoComplete="name"
                {...register('fullName')}
                className={cn(errors.fullName && 'border-destructive')}
              />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            {/* email */}
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
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            {/* password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a password"
                  autoComplete="new-password"
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
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}

              {/* strength indicator */}
              {passwordValue.length > 0 && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full transition-all duration-300', strength.color)}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{strength.label}</p>
                </div>
              )}
            </div>

            {/* terms */}
            <p className="text-xs text-muted-foreground">
              By signing up you agree to our{' '}
              <Link to="#" className="text-primary hover:underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="#" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>

            {/* submit */}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Account
            </Button>
          </form>

          {/* footer link */}
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

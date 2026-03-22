import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Building2,
  Zap,
  Calendar,
  BookOpen,
  Mic,
  Palette,
  Phone,
  Bot,
  Check,
  ArrowRight,
  Star,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Animation helpers                                                         */
/* -------------------------------------------------------------------------- */

const fadeUp = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, ease: 'easeOut' },
};

const stagger = {
  initial: 'hidden',
  whileInView: 'visible',
  viewport: { once: true, margin: '-60px' },
  variants: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
  },
};

const staggerChild = {
  variants: {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
  },
};

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

const features = [
  {
    icon: Building2,
    title: 'Multi-Industry',
    description:
      'Built for dental clinics, med spas, HVAC companies, law firms, salons, and more. One platform, every vertical.',
  },
  {
    icon: Zap,
    title: 'Instant Setup',
    description:
      'Go live in under 15 minutes. No coding required. Just paste your business info and connect your phone number.',
  },
  {
    icon: Calendar,
    title: 'Live Calendar Sync',
    description:
      'Connects to Google Calendar, Calendly, or your existing booking system. Appointments appear in real time.',
  },
  {
    icon: BookOpen,
    title: 'Knowledge Base',
    description:
      'Upload FAQs, service menus, and policies. Your AI agent answers questions with accurate, on-brand responses.',
  },
  {
    icon: Mic,
    title: 'Call Recordings',
    description:
      'Every call is recorded and transcribed. Review conversations, track outcomes, and train your agent to improve.',
  },
  {
    icon: Palette,
    title: 'White Label',
    description:
      'Resell under your own brand. Custom greeting, hold music, and transfer rules. Your clients never see our name.',
  },
];

const steps = [
  {
    num: '1',
    title: 'Create Your Agent',
    description:
      'Pick your industry template, set your business hours, and customize the greeting. Takes about 5 minutes.',
  },
  {
    num: '2',
    title: 'Add Knowledge',
    description:
      'Upload your FAQ document or paste service details. The AI learns your business instantly.',
  },
  {
    num: '3',
    title: 'Go Live',
    description:
      'Forward your phone number or get a new one. Your AI receptionist starts taking calls immediately.',
  },
];

const pricingPlans = [
  {
    name: 'Starter',
    monthlyPrice: 299,
    description: 'Perfect for solo practices and small businesses getting started with AI.',
    features: [
      '1 AI Agent',
      '500 minutes / month',
      'Business hours routing',
      'Call recordings',
      'Email support',
      'Basic analytics',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Growth',
    monthlyPrice: 599,
    description: 'For growing businesses that need more capacity and advanced features.',
    features: [
      '3 AI Agents',
      '2,000 minutes / month',
      '24/7 availability',
      'Live calendar sync',
      'Knowledge base',
      'Priority support',
      'Advanced analytics',
      'Custom greetings',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    monthlyPrice: null,
    description: 'For agencies and multi-location businesses needing full customization.',
    features: [
      'Unlimited agents',
      'Unlimited minutes',
      'White-label branding',
      'API access',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
      'HIPAA compliance',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

const testimonials = [
  {
    initials: 'SK',
    name: 'Dr. Sarah Kim',
    role: 'Owner',
    company: 'Bright Smile Dental',
    quote:
      'We were missing 30% of calls after hours. VoiceAI picks up every single one now and books directly into our calendar. Revenue is up 22% in three months.',
  },
  {
    initials: 'JR',
    name: 'James Rivera',
    role: 'Operations Manager',
    company: 'CoolBreeze HVAC',
    quote:
      'Our dispatchers were overwhelmed during summer. VoiceAI handles the overflow, qualifies leads, and schedules service calls. It paid for itself in the first week.',
  },
  {
    initials: 'AL',
    name: 'Anika Larsen',
    role: 'Founder',
    company: 'Glow Med Spa',
    quote:
      'Clients love that they can book a facial or ask about pricing at midnight. The voice sounds natural and our booking rate went through the roof.',
  },
];

const trustedCompanies = ['BrightSmile', 'CoolBreeze', 'GlowSpa', 'PeakFitness', 'UrbanVet'];

const footerLinks = {
  Product: ['Features', 'Pricing', 'Integrations', 'API Docs'],
  Company: ['About', 'Blog', 'Careers', 'Press'],
  Resources: ['Help Center', 'Status', 'Community', 'Webinars'],
  Legal: ['Privacy', 'Terms', 'Security', 'HIPAA'],
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [annual, setAnnual] = useState(true);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ------------------------------------------------------------------ */}
      {/*  STICKY NAV                                                        */}
      {/* ------------------------------------------------------------------ */}
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          scrolled
            ? 'bg-background/80 backdrop-blur-xl border-b border-border shadow-lg shadow-black/5'
            : 'bg-transparent'
        )}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Phone className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">VoiceAI</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </a>
          </div>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 md:flex">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Login
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Start Free</Button>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {/* Mobile menu */}
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-b border-border bg-background/95 backdrop-blur-xl px-6 py-4 md:hidden"
          >
            <div className="flex flex-col gap-4">
              <a
                href="#features"
                onClick={() => setMobileOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Features
              </a>
              <a
                href="#pricing"
                onClick={() => setMobileOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Pricing
              </a>
              <div className="flex gap-2 pt-2 border-t border-border">
                <Link to="/login" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    Login
                  </Button>
                </Link>
                <Link to="/signup" className="flex-1">
                  <Button size="sm" className="w-full">
                    Start Free
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </header>

      {/* ------------------------------------------------------------------ */}
      {/*  HERO                                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-28">
        {/* Background gradient blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 h-[400px] w-[400px] rounded-full bg-primary/5 blur-[100px]" />
        </div>

        <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-16 px-6 lg:flex-row lg:items-start lg:gap-12">
          {/* Left copy */}
          <motion.div className="flex-1 text-center lg:text-left" {...fadeUp}>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5 text-primary" />
              AI-Powered Voice Receptionist
            </div>

            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Your AI Receptionist.{' '}
              <span className="text-primary">Live in 15 Minutes.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg text-muted-foreground lg:text-xl">
              Never miss a call. Book appointments 24/7. Works for dental clinics, med spas, HVAC,
              and more.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start">
              <Link to="/signup">
                <Button size="xl" className="gap-2">
                  Start Free — No Credit Card
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="xl"
                onClick={() => alert('Demo video coming soon!')}
              >
                Watch Demo
              </Button>
            </div>

            {/* Trust bar */}
            <div className="mt-12">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Trusted by 200+ businesses
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-6 lg:justify-start">
                {trustedCompanies.map((name) => (
                  <span
                    key={name}
                    className="text-sm font-medium text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right phone mockup */}
          <motion.div
            className="flex-1 flex justify-center lg:justify-end"
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="relative w-[320px]">
              {/* Phone frame */}
              <div className="rounded-[2.5rem] border border-border bg-card p-4 shadow-2xl shadow-black/20">
                {/* Status bar */}
                <div className="mb-4 flex items-center justify-between px-2">
                  <span className="text-xs text-muted-foreground">9:41</span>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-medium text-primary">Live</span>
                  </div>
                </div>

                {/* Agent header */}
                <div className="mb-6 flex items-center gap-3 px-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">VoiceAI Agent</p>
                    <p className="text-xs text-muted-foreground">Bright Smile Dental</p>
                  </div>
                </div>

                {/* Chat bubbles */}
                <motion.div
                  className="space-y-3 px-1"
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={{
                    hidden: {},
                    visible: { transition: { staggerChildren: 0.6, delayChildren: 0.5 } },
                  }}
                >
                  {/* Caller bubble 1 */}
                  <motion.div
                    className="flex justify-end"
                    variants={{
                      hidden: { opacity: 0, y: 16, scale: 0.95 },
                      visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4 } },
                    }}
                  >
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      Hi, I'd like to book a cleaning for next Tuesday
                    </div>
                  </motion.div>

                  {/* Agent bubble */}
                  <motion.div
                    className="flex justify-start"
                    variants={{
                      hidden: { opacity: 0, y: 16, scale: 0.95 },
                      visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4 } },
                    }}
                  >
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-muted px-4 py-2.5 text-sm">
                      I'd be happy to help! I have availability at 10am and 2pm on Tuesday. Which
                      works better?
                    </div>
                  </motion.div>

                  {/* Caller bubble 2 */}
                  <motion.div
                    className="flex justify-end"
                    variants={{
                      hidden: { opacity: 0, y: 16, scale: 0.95 },
                      visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4 } },
                    }}
                  >
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      2pm works great!
                    </div>
                  </motion.div>
                </motion.div>

                {/* Input area */}
                <div className="mt-6 flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5">
                  <Mic className="h-4 w-4 text-primary" />
                  <span className="flex-1 text-xs text-muted-foreground">Speaking...</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <motion.div
                        key={i}
                        className="w-0.5 rounded-full bg-primary"
                        animate={{ height: [4, 12, 4] }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          delay: i * 0.1,
                          ease: 'easeInOut',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  STATS BAR                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 -mt-4">
        <motion.div
          className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/10"
          {...fadeUp}
        >
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { value: '200+', label: 'Businesses' },
              { value: '50,000+', label: 'Calls Handled' },
              { value: '98%', label: 'Accuracy' },
              { value: '<1s', label: 'Response Time' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="font-mono text-3xl font-bold text-primary">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  FEATURES GRID                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section id="features" className="py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div className="mx-auto max-w-2xl text-center" {...fadeUp}>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Features
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to automate your front desk
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Purpose-built tools for businesses that rely on phone calls to drive revenue.
            </p>
          </motion.div>

          <motion.div
            className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            {...stagger}
          >
            {features.map((f) => (
              <motion.div
                key={f.title}
                {...staggerChild}
                className="group relative rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  HOW IT WORKS                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-border bg-card/50 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div className="mx-auto max-w-2xl text-center" {...fadeUp}>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              How It Works
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Live in three simple steps
            </h2>
          </motion.div>

          <motion.div
            className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8"
            {...stagger}
          >
            {steps.map((step, i) => (
              <motion.div key={step.num} {...staggerChild} className="relative text-center">
                {/* Connector line (between steps) */}
                {i < steps.length - 1 && (
                  <div className="absolute right-0 top-8 hidden h-px w-full translate-x-1/2 bg-gradient-to-r from-border to-transparent md:block" />
                )}

                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-2xl font-bold text-primary">
                  {step.num}
                </div>
                <h3 className="mt-6 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  PRICING                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section id="pricing" className="py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div className="mx-auto max-w-2xl text-center" {...fadeUp}>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Pricing
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Start free. Upgrade when you are ready. Cancel anytime.
            </p>

            {/* Toggle */}
            <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border bg-card p-1">
              <button
                onClick={() => setAnnual(false)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-all',
                  !annual
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-all',
                  annual
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Annual
                <span className="ml-1.5 text-xs opacity-80">-20%</span>
              </button>
            </div>
          </motion.div>

          <motion.div
            className="mt-14 grid gap-6 lg:grid-cols-3"
            {...stagger}
          >
            {pricingPlans.map((plan) => {
              const displayPrice = plan.monthlyPrice
                ? annual
                  ? Math.round(plan.monthlyPrice * 0.8)
                  : plan.monthlyPrice
                : null;

              return (
                <motion.div
                  key={plan.name}
                  {...staggerChild}
                  className={cn(
                    'relative flex flex-col rounded-2xl border p-8 transition-all duration-300',
                    plan.popular
                      ? 'border-primary bg-card shadow-xl shadow-primary/10 scale-[1.02]'
                      : 'border-border bg-card hover:border-primary/30'
                  )}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                      Most Popular
                    </div>
                  )}

                  <div>
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                  </div>

                  <div className="mt-6">
                    {displayPrice !== null ? (
                      <div className="flex items-baseline gap-1">
                        <span className="font-mono text-4xl font-bold">${displayPrice}</span>
                        <span className="text-muted-foreground">/mo</span>
                      </div>
                    ) : (
                      <span className="font-mono text-4xl font-bold">Custom</span>
                    )}
                    {annual && displayPrice !== null && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Billed annually (${displayPrice * 12}/yr)
                      </p>
                    )}
                  </div>

                  <ul className="mt-8 flex-1 space-y-3">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    <Link to={plan.name === 'Enterprise' ? '/signup' : '/signup'}>
                      <Button
                        variant={plan.popular ? 'default' : 'outline'}
                        size="lg"
                        className="w-full"
                      >
                        {plan.cta}
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  TESTIMONIALS                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-border bg-card/50 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div className="mx-auto max-w-2xl text-center" {...fadeUp}>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Testimonials
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Loved by businesses everywhere
            </h2>
          </motion.div>

          <motion.div
            className="mt-16 grid gap-6 md:grid-cols-3"
            {...stagger}
          >
            {testimonials.map((t) => (
              <motion.div
                key={t.name}
                {...staggerChild}
                className="rounded-xl border border-border bg-card p-6"
              >
                {/* Stars */}
                <div className="mb-4 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-primary text-primary"
                    />
                  ))}
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  "{t.quote}"
                </p>

                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.role}, {t.company}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  CTA BAND                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to never miss a call again?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Join 200+ businesses already using VoiceAI to grow their revenue on autopilot.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link to="/signup">
                <Button size="xl" className="gap-2">
                  Start Free — No Credit Card
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="xl">
                  Login
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  FOOTER                                                            */}
      {/* ------------------------------------------------------------------ */}
      <footer className="border-t border-border bg-card/50 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 md:grid-cols-6">
            {/* Brand column */}
            <div className="md:col-span-2">
              <Link to="/" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <Phone className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold tracking-tight">VoiceAI</span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                AI-powered voice agents for every business. Automate calls, book appointments, and
                delight customers around the clock.
              </p>
            </div>

            {/* Link columns */}
            {Object.entries(footerLinks).map(([heading, links]) => (
              <div key={heading}>
                <h4 className="text-sm font-semibold">{heading}</h4>
                <ul className="mt-4 space-y-2.5">
                  {links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 border-t border-border pt-8 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} VoiceAI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

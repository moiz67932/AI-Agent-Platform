import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, ArrowRight, Menu, X, Check, Sun, Moon,
  Plus, Zap, PhoneCall, CheckCircle2, TrendingUp,
  Calendar as CalendarIcon, Mail, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';

/* ======================================================================== */
/*  CONSTANTS                                                               */
/* ======================================================================== */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const NAV_LINKS = [
  { label: 'Product', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '#' },
];

const TICKER_ITEMS = [
  'Appointment booked — Bright Smile Dental · 2m ago',
  'Reschedule handled — City Ortho · 7m ago',
  'FAQ answered — Lakeview Dental · 9m ago',
  'Booking confirmed — Glow Med Spa · 12m ago',
  'New patient intake — Smile Works · 15m ago',
  'Callback scheduled — Metro Dental · 18m ago',
  'Insurance query — Premier Ortho · 21m ago',
  'Appointment booked — Radiance Spa · 24m ago',
  'Follow-up reminder — City Dental · 27m ago',
  'Walk-in converted — Bright Smile · 30m ago',
];

/* ======================================================================== */
/*  HOOKS                                                                   */
/* ======================================================================== */

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function useCountUp(target: number, duration = 1400, trigger = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();
  useEffect(() => {
    if (!trigger) return;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, trigger]);
  return value;
}

/* ======================================================================== */
/*  ANIMATION VARIANTS                                                      */
/* ======================================================================== */

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: EASE_OUT },
  }),
};

/* ======================================================================== */
/*  NAV                                                                     */
/* ======================================================================== */

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useUIStore();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-foyer-bg/92 backdrop-blur-2xl border-b border-foyer-border'
          : 'bg-transparent'
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 h-[60px]">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-foyer-t1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <span className="font-display text-lg italic text-foyer-t1">Foyer</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-foyer-t2 hover:text-foyer-t1 transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop right */}
        <div className="hidden lg:flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-foyer-surface2 text-foyer-t2 hover:text-foyer-t1 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Link to="/login" className="text-sm font-medium text-foyer-t2 hover:text-foyer-t1 transition-colors px-4 py-2">
            Sign in
          </Link>
          <Link
            to="/signup"
            className="text-sm font-medium bg-foyer-t1 text-foyer-surface px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
          >
            Get started &rarr;
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button className="lg:hidden text-foyer-t1 p-2" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-b border-foyer-border bg-foyer-bg/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {NAV_LINKS.map((link) => (
                <a key={link.label} href={link.href} onClick={() => setMobileOpen(false)}
                  className="text-sm text-foyer-t2 hover:text-foyer-t1 py-3 border-b border-foyer-border/50">
                  {link.label}
                </a>
              ))}
              <div className="flex gap-3 pt-4">
                <Link to="/login" className="flex-1 text-center text-sm text-foyer-t2 border border-foyer-border rounded-xl py-2.5">Sign in</Link>
                <Link to="/signup" className="flex-1 text-center text-sm font-medium bg-foyer-t1 text-foyer-surface rounded-xl py-2.5">Get started</Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ======================================================================== */
/*  HERO                                                                    */
/* ======================================================================== */

function LivePulseDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex h-[7px] w-[7px]', className)}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-foyer-gdot animate-foyer-pulse" />
      <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-foyer-gdot" />
    </span>
  );
}

function HeroTimeline() {
  const [step, setStep] = useState(-1);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(0), 500),
      setTimeout(() => setStep(1), 1300),
      setTimeout(() => setStep(2), 2400),
      setTimeout(() => setStep(3), 3600),
    ];
    const loop = setInterval(() => {
      setStep(-1);
      const t = [
        setTimeout(() => setStep(0), 500),
        setTimeout(() => setStep(1), 1300),
        setTimeout(() => setStep(2), 2400),
        setTimeout(() => setStep(3), 3600),
      ];
      timers.push(...t);
    }, 6000);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, []);

  const nodes = [
    { label: 'Call connected', time: '0ms', color: 'green' },
    { label: 'Agent answered', time: '423ms', color: 'green' },
    { label: 'Appointment captured', time: '18.2s', color: 'neutral' },
    { label: 'Everything synced', time: '+0.3s', color: 'blue' },
  ];

  return (
    <div className="w-full max-w-[500px] mx-auto">
      <div className="rounded-2xl border border-foyer-border bg-foyer-surface p-5 shadow-lg shadow-black/[0.03]">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-label uppercase text-foyer-t3 tracking-widest">Live call</span>
            <span className="font-mono text-xs text-foyer-t2">&middot; +1 (310) 555-0142</span>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-foyer-green bg-foyer-green-bg border border-foyer-green-b px-2 py-0.5 rounded-full">
            <LivePulseDot /> In progress
          </span>
        </div>

        {/* Timeline */}
        <div className="space-y-0">
          {nodes.map((node, i) => {
            const isDone = step >= i;
            const isActive = step === i && i === 3;
            return (
              <div key={i} className="flex gap-3">
                {/* Connector */}
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300',
                    isDone && !isActive && 'bg-foyer-green border-foyer-green',
                    isActive && 'bg-foyer-blue border-foyer-blue',
                    !isDone && 'bg-foyer-surface2 border-foyer-border'
                  )}>
                    {isDone && <Check className="h-3 w-3 text-white" />}
                  </div>
                  {i < 3 && (
                    <div className={cn(
                      'w-0.5 h-8 transition-all duration-300',
                      step > i ? 'bg-foyer-green' : 'bg-foyer-border'
                    )} />
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foyer-t1">{node.label}</span>
                    <span className="text-[10px] font-mono text-foyer-t3">{node.time}</span>
                  </div>
                  {/* Step content */}
                  {i === 0 && (
                    <p className="text-[11px] text-foyer-t3 mt-1">Twilio → LiveKit → Bright Smile agent dispatched</p>
                  )}
                  {i === 1 && (
                    <div className="mt-1.5 bg-foyer-surface2 rounded-lg px-3 py-2">
                      <p className="text-xs text-foyer-t2 italic">"Hi, thanks for calling Bright Smile Dental! How can I help today?"</p>
                      <div className="flex items-center gap-0.5 mt-2">
                        {[1,2,3,4,5,6,7].map(j => (
                          <div key={j} className="w-[3px] rounded-full bg-foyer-blue"
                            style={{
                              height: `${8 + Math.random() * 10}px`,
                              animation: `foyer-waveform ${0.5 + j * 0.1}s ease-in-out infinite`,
                              animationDelay: `${j * 0.08}s`,
                            }} />
                        ))}
                      </div>
                    </div>
                  )}
                  {i === 2 && (
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      {[
                        { l: 'NAME', v: 'Sarah Johnson' },
                        { l: 'SERVICE', v: 'Cleaning' },
                        { l: 'DATE', v: 'Tue Apr 1' },
                        { l: 'TIME', v: '2:00 PM' },
                      ].map(f => (
                        <div key={f.l} className="bg-foyer-surface2 rounded-lg px-3 py-2">
                          <span className="text-label uppercase text-foyer-t3">{f.l}</span>
                          <p className="text-sm font-semibold text-foyer-t1 mt-0.5">{f.v}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {i === 3 && (
                    <div className="mt-1.5 space-y-1.5">
                      {[
                        'Google Calendar event created',
                        'Confirmation email dispatched',
                        'Database & analytics updated',
                      ].map(t => (
                        <div key={t} className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-foyer-green" />
                          <span className="text-xs text-foyer-t2">{t}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HeroSideCardLeft() {
  return (
    <div className="hidden xl:block absolute left-0 top-20 w-[190px]">
      <div className="rounded-xl border border-foyer-border bg-foyer-surface p-4 shadow-lg shadow-black/[0.03]">
        <span className="text-label uppercase text-foyer-t3">This week</span>
        <p className="text-metric font-extrabold text-foyer-t1 mt-1">142</p>
        <p className="text-xs text-foyer-t2">calls handled</p>
        {/* Mini bars */}
        <div className="flex items-end gap-1 h-8 mt-3">
          {[40, 55, 35, 65, 50, 75, 90].map((h, i) => (
            <div key={i} className={cn(
              'flex-1 rounded-sm transition-all',
              i >= 5 ? 'bg-foyer-blue' : 'bg-foyer-blue/20'
            )} style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="border-t border-foyer-border mt-3 pt-2 flex justify-between">
          <div>
            <span className="text-sm font-bold text-foyer-green">58</span>
            <span className="text-[10px] text-foyer-t3 ml-1">Booked</span>
          </div>
          <div>
            <span className="text-sm font-bold text-foyer-t1">41%</span>
            <span className="text-[10px] text-foyer-t3 ml-1">Rate</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroSideCardRight() {
  const items = [
    { color: 'bg-foyer-green', name: 'Sarah Johnson', time: '2:00 PM', service: 'Cleaning' },
    { color: 'bg-foyer-blue', name: 'Marcus Webb', time: '3:30 PM', service: 'HydraFacial' },
    { color: 'bg-foyer-purple', name: 'Linda Park', time: '4:15 PM', service: 'Consult' },
  ];
  return (
    <div className="hidden xl:block absolute right-0 top-16 w-[190px]">
      <div className="rounded-xl border border-foyer-border bg-foyer-surface p-4 shadow-lg shadow-black/[0.03]">
        <span className="text-label uppercase text-foyer-t3">Today's schedule</span>
        <div className="mt-3 space-y-2.5">
          {items.map(it => (
            <div key={it.name} className="flex items-start gap-2">
              <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', it.color)} />
              <div>
                <p className="text-xs font-semibold text-foyer-t1">{it.name}</p>
                <p className="text-[10px] text-foyer-t3">{it.time} &middot; {it.service}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-2 border-t border-foyer-border">
          <span className="text-[10px] font-semibold text-foyer-green">+3 new bookings today</span>
        </div>
      </div>
    </div>
  );
}

function CounterStrip() {
  const [count, setCount] = useState(147296);
  useEffect(() => {
    const iv = setInterval(() => setCount(c => c + Math.floor(Math.random() * 3) + 1), 3200);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="w-full max-w-[500px] mx-auto mt-4">
      <div className="flex items-center justify-between rounded-xl border border-foyer-border bg-foyer-surface px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-foyer-green-bg flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-foyer-green" />
          </div>
          <div>
            <span className="text-lg font-extrabold text-foyer-t1 font-mono tabular-nums">{count.toLocaleString()}</span>
            <p className="text-[11px] text-foyer-t2">appointments booked through Foyer</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-foyer-green bg-foyer-green-bg border border-foyer-green-b px-2 py-0.5 rounded-full">
          <LivePulseDot /> Live
        </span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative pt-32 pb-16 lg:pt-40 lg:pb-24 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 text-center">
        {/* Eyebrow pill */}
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible" className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-foyer-green bg-foyer-green-bg border border-foyer-green-b px-4 py-1.5 rounded-full">
            <LivePulseDot /> Now live &middot; Trusted by 40+ businesses
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1 custom={1} variants={fadeUp} initial="hidden" animate="visible" className="text-hero-sm lg:text-hero mx-auto max-w-4xl">
          <span className="text-foyer-t1">Your calls.</span>
          <br />
          <span className="text-foyer-t1">
            <span className="font-display italic text-foyer-blue">Answered perfectly.</span>
          </span>
          <br />
          <span className="text-foyer-t1">Every time.</span>
        </motion.h1>

        {/* Sub */}
        <motion.p custom={2} variants={fadeUp} initial="hidden" animate="visible" className="mt-6 text-base lg:text-[17px] text-foyer-t2 max-w-[480px] mx-auto leading-relaxed">
          Deploy an AI receptionist in 60 seconds. It books appointments, handles questions, and syncs your calendar — 24/7, zero staff needed.
        </motion.p>

        {/* CTAs */}
        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Link to="/signup" className="inline-flex items-center gap-2 bg-foyer-t1 text-foyer-surface font-medium text-[15px] px-7 py-3.5 rounded-xl hover:opacity-90 transition-opacity">
            Deploy your agent <ArrowRight className="h-4 w-4" />
          </Link>
          <button className="inline-flex items-center gap-2 border border-foyer-border text-foyer-t1 font-medium text-[15px] px-7 py-3.5 rounded-xl hover:border-foyer-border2 transition-colors">
            Watch demo
          </button>
        </motion.div>

        {/* Social proof */}
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible" className="flex items-center justify-center gap-2 mt-6">
          <div className="flex -space-x-2">
            {[
              'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500'
            ].map((bg, i) => (
              <div key={i} className={cn('w-[26px] h-[26px] rounded-full border-2 border-foyer-bg flex items-center justify-center text-[9px] font-bold text-white', bg)}>
                {['BS','SS','CC','DP'][i]}
              </div>
            ))}
          </div>
          <span className="text-xs text-foyer-t3">Joined by <strong className="text-foyer-t2">40+ clinics & spas</strong> this month</span>
        </motion.div>

        {/* Hero cards stage */}
        <div className="relative mt-12 lg:mt-16">
          <motion.div custom={3.5} variants={fadeUp} initial="hidden" animate="visible">
            <HeroSideCardLeft />
          </motion.div>
          <motion.div custom={7.5} variants={fadeUp} initial="hidden" animate="visible">
            <HeroSideCardRight />
          </motion.div>
          <motion.div custom={3.5} variants={fadeUp} initial="hidden" animate="visible">
            <HeroTimeline />
            <CounterStrip />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ======================================================================== */
/*  HOW IT WORKS                                                            */
/* ======================================================================== */

const HOW_STEPS = [
  { icon: Plus, label: 'Configure', desc: "Set your agent's name, persona, services and hours", pill: '~60 seconds' },
  { icon: Zap, label: 'Publish', desc: 'Click publish. We deploy instantly to our infrastructure', pill: '~3 seconds' },
  { icon: PhoneCall, label: 'Number live', desc: 'A real phone number is provisioned and ready', pill: '~15 seconds' },
  { icon: CheckCircle2, label: 'Calls handled', desc: 'AI answers every call, books appointments 24/7', pill: '24/7' },
  { icon: TrendingUp, label: 'Data synced', desc: 'Calendar, email, database — all updated instantly', pill: 'Instant' },
];

function HowItWorks() {
  const { ref, inView } = useInView(0.3);
  const [activeStep, setActiveStep] = useState(-1);

  useEffect(() => {
    if (!inView) return;
    let step = 0;
    const iv = setInterval(() => {
      setActiveStep(step);
      step++;
      if (step > 4) { step = 0; setActiveStep(-1); }
    }, 950);
    return () => clearInterval(iv);
  }, [inView]);

  return (
    <section id="how-it-works" ref={ref} className="py-20 lg:py-28 bg-foyer-surface">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <span className="text-label uppercase text-foyer-t3 tracking-widest border border-foyer-border px-3 py-1 rounded-full">How it works</span>
        <h2 className="text-section-sm lg:text-section text-foyer-t1 mt-4">
          From sign-up to <span className="font-display italic">live call</span> in 60 seconds
        </h2>
        <p className="text-sm text-foyer-t2 mt-3">No code. No waiting. Your AI receptionist is live before your next coffee.</p>

        {/* Steps */}
        <div className="relative mt-14">
          {/* Progress bar */}
          <div className="hidden md:block absolute top-[19px] left-[10%] right-[10%] h-[2px] bg-foyer-border">
            <div
              className="h-full bg-foyer-gdot transition-all duration-700 ease-out"
              style={{ width: `${Math.max(0, (activeStep / 4) * 100)}%` }}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            {HOW_STEPS.map((s, i) => {
              const isLit = i <= activeStep;
              const isNow = i === activeStep;
              return (
                <div key={i} className="flex flex-col items-center text-center relative">
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10',
                    isNow ? 'bg-foyer-blue-bg border-foyer-blue-b shadow-[0_0_0_6px_rgba(37,99,235,0.08)]' :
                    isLit ? 'bg-foyer-green-bg border-foyer-green-b shadow-[0_0_0_6px_rgba(34,197,94,0.08)]' :
                    'bg-foyer-surface2 border-foyer-border'
                  )}>
                    <s.icon className={cn(
                      'h-4 w-4 transition-colors duration-300',
                      isNow ? 'text-foyer-blue' : isLit ? 'text-foyer-green' : 'text-foyer-t3'
                    )} />
                  </div>
                  <h3 className="text-sm font-bold text-foyer-t1 mt-3">{s.label}</h3>
                  <p className="text-xs text-foyer-t2 mt-1 leading-relaxed">{s.desc}</p>
                  <span className={cn(
                    'text-[10px] font-semibold mt-2 px-2.5 py-0.5 rounded-full transition-colors duration-300',
                    isLit ? 'bg-foyer-green-bg text-foyer-green border border-foyer-green-b' : 'bg-foyer-surface2 text-foyer-t3 border border-foyer-border'
                  )}>{s.pill}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ======================================================================== */
/*  FEATURES                                                                */
/* ======================================================================== */

function Features() {
  const { ref, inView } = useInView();

  return (
    <section id="features" ref={ref} className="py-20 lg:py-28 bg-foyer-bg">
      <div className="mx-auto max-w-[1100px] px-6">
        <span className="text-label uppercase text-foyer-t3 tracking-widest border border-foyer-border px-3 py-1 rounded-full">Features</span>
        <h2 className="text-section-sm lg:text-section text-foyer-t1 mt-4 max-w-xl">
          Everything your front desk does,{' '}
          <span className="font-display italic">done better</span>
        </h2>

        <div className="grid md:grid-cols-2 gap-5 mt-12">
          {/* Natural conversation */}
          <motion.div
            initial={{ opacity: 0, y: 18 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0, ease: EASE_OUT }}
            className="rounded-2xl border border-foyer-border bg-foyer-surface p-7"
          >
            <div className="w-12 h-12 rounded-[14px] bg-foyer-blue-bg flex items-center justify-center">
              <Phone className="h-5 w-5 text-foyer-blue" />
            </div>
            <h3 className="text-card-title text-foyer-t1 mt-4">Natural conversation</h3>
            <p className="text-[13.5px] text-foyer-t2 mt-2 leading-relaxed">Your agent speaks naturally, understands context, and handles complex booking flows just like a trained receptionist would.</p>
            {/* Chat demo */}
            <div className="mt-5 space-y-2.5">
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foyer-blue-bg flex items-center justify-center text-[9px] font-bold text-foyer-blue">AI</span>
                <div className="bg-foyer-t1 text-foyer-surface text-xs px-3.5 py-2 rounded-xl rounded-tl-sm max-w-[300px]">
                  Hi! Thanks for calling Bright Smile. How can I help today?
                </div>
              </div>
              <div className="flex items-start gap-2 justify-end">
                <div className="bg-foyer-surface2 text-foyer-t1 text-xs px-3.5 py-2 rounded-xl rounded-tr-sm max-w-[300px]">
                  I need a cleaning, maybe Tuesday?
                </div>
                <span className="shrink-0 w-6 h-6 rounded-full bg-foyer-surface2 flex items-center justify-center text-[9px] font-bold text-foyer-t2">SJ</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foyer-blue-bg flex items-center justify-center text-[9px] font-bold text-foyer-blue">AI</span>
                <div className="bg-foyer-t1 text-foyer-surface text-xs px-3.5 py-2 rounded-xl rounded-tl-sm max-w-[300px]">
                  Perfect! I have Tuesday at 2pm or 4pm. Which works better?
                </div>
              </div>
            </div>
          </motion.div>

          {/* Calendar sync */}
          <motion.div
            initial={{ opacity: 0, y: 18 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.08, ease: EASE_OUT }}
            className="rounded-2xl border border-foyer-border bg-foyer-surface p-7"
          >
            <div className="w-12 h-12 rounded-[14px] bg-foyer-green-bg flex items-center justify-center">
              <CalendarIcon className="h-5 w-5 text-foyer-green" />
            </div>
            <h3 className="text-card-title text-foyer-t1 mt-4">Calendar sync</h3>
            <p className="text-[13.5px] text-foyer-t2 mt-2 leading-relaxed">Every booking instantly creates a Google Calendar event with full attendee details, reminders, and call notes.</p>
            {/* Week calendar demo */}
            <div className="mt-5">
              <div className="grid grid-cols-7 gap-1 text-center">
                {['M','T','W','T','F','S','S'].map((d,i) => (
                  <span key={i} className="text-[10px] font-semibold text-foyer-t3">{d}</span>
                ))}
                {[28,29,30,31,1,2,3].map((d,i) => (
                  <div key={i} className={cn(
                    'aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-colors',
                    i === 1 || i === 3 ? 'bg-foyer-green-bg text-foyer-green border border-foyer-green-b' :
                    i === 4 ? 'bg-foyer-blue-bg text-foyer-blue border border-foyer-blue-b' :
                    'text-foyer-t2'
                  )}>{d}</div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Real-time analytics */}
          <motion.div
            initial={{ opacity: 0, y: 18 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.16, ease: EASE_OUT }}
            className="rounded-2xl border border-foyer-border bg-foyer-surface p-7"
          >
            <div className="w-12 h-12 rounded-[14px] bg-foyer-purple-bg flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-foyer-purple" />
            </div>
            <h3 className="text-card-title text-foyer-t1 mt-4">Real-time analytics</h3>
            <p className="text-[13.5px] text-foyer-t2 mt-2 leading-relaxed">Track calls, bookings, missed opportunities, and peak hours — updated the moment each call ends.</p>
            {/* Bar chart demo */}
            <div className="mt-5">
              <div className="flex items-end gap-2 h-20">
                {[
                  { h: 40, label: 'Mon' },
                  { h: 55, label: 'Tue' },
                  { h: 35, label: 'Wed' },
                  { h: 80, label: 'Thu' },
                  { h: 60, label: 'Fri' },
                  { h: 45, label: 'Sat' },
                  { h: 70, label: 'Sun' },
                ].map((bar, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <motion.div
                      className={cn(
                        'w-full rounded-sm',
                        i === 3 || i === 6 ? 'bg-foyer-blue' : 'bg-foyer-blue/25'
                      )}
                      initial={{ height: 0 }}
                      animate={inView ? { height: `${bar.h}%` } : { height: 0 }}
                      transition={{ duration: 0.6, delay: i * 0.06, ease: EASE_OUT }}
                      style={{ originY: 1 }}
                    />
                    <span className="text-[9px] text-foyer-t3">{bar.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Email alerts */}
          <motion.div
            initial={{ opacity: 0, y: 18 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.24, ease: EASE_OUT }}
            className="rounded-2xl border border-foyer-border bg-foyer-surface p-7"
          >
            <div className="w-12 h-12 rounded-[14px] bg-foyer-amber-bg flex items-center justify-center">
              <Mail className="h-5 w-5 text-foyer-amber" />
            </div>
            <h3 className="text-card-title text-foyer-t1 mt-4">Instant email alerts</h3>
            <p className="text-[13.5px] text-foyer-t2 mt-2 leading-relaxed">Business owners get a beautiful confirmation email the moment a booking is made, with caller details and full transcript.</p>
            {/* Email demo */}
            <div className="mt-5 rounded-lg border border-foyer-border bg-foyer-surface2 p-4">
              <p className="text-[10px] text-foyer-t3">FROM: agent@foyer.app &middot; just now</p>
              <p className="text-sm font-bold text-foyer-t1 mt-1">New booking — Sarah Johnson</p>
              <p className="text-xs text-foyer-t2 mt-0.5">Teeth Cleaning &middot; Tue Apr 1 &middot; 2:00 PM</p>
              <div className="flex gap-2 mt-3">
                <span className="text-[10px] font-semibold text-foyer-green bg-foyer-green-bg border border-foyer-green-b px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Check className="h-3 w-3" /> Calendar added
                </span>
                <span className="text-[10px] font-semibold text-foyer-blue bg-foyer-blue-bg border border-foyer-blue-b px-2 py-0.5 rounded-md">
                  View details
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ======================================================================== */
/*  METRICS STRIP                                                           */
/* ======================================================================== */

function MetricsStrip() {
  const { ref, inView } = useInView();
  const c1 = useCountUp(423, 1400, inView);
  const c2 = useCountUp(99, 1600, inView);
  const c3 = useCountUp(40, 1200, inView);

  return (
    <section ref={ref} className="bg-foyer-t1 py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <p className="text-metric-big text-white font-mono tabular-nums">{c1}<span className="text-xl text-white/60">ms</span></p>
            <p className="text-sm text-white/60 mt-1">Average response time</p>
            <p className="text-xs text-foyer-gdot font-semibold mt-1">Faster than any human</p>
          </div>
          <div>
            <p className="text-metric-big text-white font-mono tabular-nums">{c2}.7<span className="text-xl text-white/60">%</span></p>
            <p className="text-sm text-white/60 mt-1">Calls answered</p>
            <p className="text-xs text-foyer-gdot font-semibold mt-1">No missed opportunities</p>
          </div>
          <div>
            <p className="text-metric-big text-white font-mono tabular-nums">{c3}<span className="text-xl text-white/60">+</span></p>
            <p className="text-sm text-white/60 mt-1">Businesses using Foyer</p>
            <p className="text-xs text-foyer-gdot font-semibold mt-1">And growing daily</p>
          </div>
        </div>
      </div>
      {/* Ticker */}
      <div className="mt-10 border-t border-white/[0.08] overflow-hidden">
        <div className="flex foyer-ticker whitespace-nowrap py-3">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="text-[12.5px] text-white/40 mx-6 shrink-0">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-foyer-gdot mr-2 align-middle" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ======================================================================== */
/*  TESTIMONIALS                                                            */
/* ======================================================================== */

const TESTIMONIALS = [
  {
    name: 'Dr. Sara Khan',
    biz: 'Bright Smile Dental',
    initials: 'SK',
    color: 'bg-emerald-500',
    badge: '+ 40% bookings',
    quote: 'We used to miss 30% of our calls after hours. Now Foyer handles everything. We woke up to 3 new bookings on a Sunday morning.',
  },
  {
    name: 'Maria Rodriguez',
    biz: 'Serenity Med Spa',
    initials: 'MR',
    color: 'bg-blue-500',
    badge: '2hrs/day saved',
    quote: "My front desk used to spend 2 hours a day on the phone. Now they focus on clients in the room. It\u2019s transformed our spa.",
  },
  {
    name: 'James Liu',
    biz: 'City Ortho Clinic',
    initials: 'JL',
    color: 'bg-amber-500',
    badge: '4 min setup',
    quote: 'Setup took literally 4 minutes. I configured it, hit publish, and my number was ready before I finished my coffee.',
  },
];

function Testimonials() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-20 lg:py-28 bg-foyer-bg">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <span className="text-label uppercase text-foyer-t3 tracking-widest border border-foyer-border px-3 py-1 rounded-full">Testimonials</span>
        <h2 className="text-section-sm lg:text-section text-foyer-t1 mt-4">
          Loved by <span className="font-display italic">real businesses</span>
        </h2>

        <div className="grid md:grid-cols-3 gap-5 mt-12">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 18 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.08, ease: EASE_OUT }}
              className="rounded-2xl border border-foyer-border bg-foyer-surface p-6 text-left"
            >
              <div className="flex gap-0.5">
                {Array(5).fill(0).map((_, j) => (
                  <svg key={j} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                  </svg>
                ))}
              </div>
              <p className="text-sm text-foyer-t1 mt-4 leading-relaxed italic">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3 mt-5 pt-4 border-t border-foyer-border">
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white', t.color)}>
                  {t.initials}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foyer-t1">{t.name}</p>
                  <p className="text-[11px] text-foyer-t3">{t.biz}</p>
                </div>
                <span className="text-[10px] font-semibold text-foyer-green bg-foyer-green-bg border border-foyer-green-b px-2 py-0.5 rounded-full">{t.badge}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ======================================================================== */
/*  PRICING                                                                 */
/* ======================================================================== */

const PLANS = [
  {
    name: 'Starter',
    price: '$29',
    period: '/mo',
    sub: '1 agent \u00b7 billed monthly',
    featured: false,
    features: ['1 AI agent', '500 calls/month', 'Google Calendar sync', 'Email notifications', 'Basic analytics'],
    cta: 'Get started',
  },
  {
    name: 'Pro',
    price: '$79',
    period: '/mo',
    sub: 'Up to 5 agents \u00b7 monthly',
    featured: true,
    features: ['Up to 5 AI agents', 'Unlimited calls', 'Calendar & email sync', 'Advanced analytics', 'Priority support', 'Custom agent persona'],
    cta: 'Get started',
  },
  {
    name: 'Scale',
    price: 'Custom',
    period: '',
    sub: 'Unlimited agents \u00b7 annual',
    featured: false,
    features: ['Unlimited agents', 'Unlimited calls', 'White-label option', 'SLA guarantee', 'Dedicated account manager'],
    cta: 'Talk to us',
  },
];

function Pricing() {
  const { ref, inView } = useInView();

  return (
    <section id="pricing" ref={ref} className="py-20 lg:py-28 bg-foyer-surface">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <span className="text-label uppercase text-foyer-t3 tracking-widest border border-foyer-border px-3 py-1 rounded-full">Pricing</span>
        <h2 className="text-section-sm lg:text-section text-foyer-t1 mt-4">
          Simple pricing.{' '}
          <span className="font-display italic">No surprises.</span>
        </h2>
        <p className="text-sm text-foyer-t2 mt-3">Start free. Scale as you grow. Cancel anytime.</p>

        <div className="grid md:grid-cols-3 gap-5 mt-12">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 18 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.08, ease: EASE_OUT }}
              className={cn(
                'rounded-2xl border p-7 text-left relative',
                plan.featured
                  ? 'bg-foyer-t1 border-foyer-t1 text-white'
                  : 'bg-foyer-surface border-foyer-border'
              )}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-foyer-blue px-3 py-1 rounded-full">
                  Most popular
                </span>
              )}
              <span className={cn('text-xs font-medium', plan.featured ? 'text-white/60' : 'text-foyer-t3')}>{plan.name}</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className={cn('text-[42px] font-extrabold tracking-tight', plan.featured ? 'text-white' : 'text-foyer-t1')}>
                  {plan.price}
                </span>
                <span className={cn('text-sm', plan.featured ? 'text-white/50' : 'text-foyer-t3')}>{plan.period}</span>
              </div>
              <p className={cn('text-xs mt-1', plan.featured ? 'text-white/50' : 'text-foyer-t3')}>{plan.sub}</p>
              <div className={cn('border-t my-5', plan.featured ? 'border-white/10' : 'border-foyer-border')} />
              <ul className="space-y-2.5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className={cn('h-4 w-4 shrink-0', plan.featured ? 'text-foyer-gdot' : 'text-foyer-green')} />
                    <span className={cn('text-sm', plan.featured ? 'text-white/80' : 'text-foyer-t2')}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className={cn(
                  'mt-6 block text-center text-sm font-semibold py-3 rounded-xl transition-opacity hover:opacity-90',
                  plan.featured
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'bg-foyer-t1 text-foyer-surface'
                )}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ======================================================================== */
/*  FINAL CTA                                                               */
/* ======================================================================== */

function FinalCTA() {
  return (
    <section className="py-20 lg:py-28" style={{ background: 'linear-gradient(180deg, #EEF3FF 0%, #F7F6F3 100%)' }}>
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-section-sm lg:text-section text-foyer-t1">
          Your next call is in
          <br />
          <span className="font-display italic text-foyer-blue">3 seconds.</span>
          <br />
          Is someone there?
        </h2>
        <p className="text-sm text-foyer-t2 mt-4">Deploy your AI receptionist today. No credit card required.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Link to="/signup" className="inline-flex items-center gap-2 bg-foyer-t1 text-foyer-surface font-medium text-[15px] px-7 py-3.5 rounded-xl hover:opacity-90 transition-opacity">
            Deploy your agent now <ArrowRight className="h-4 w-4" />
          </Link>
          <button className="inline-flex items-center gap-2 border border-foyer-border text-foyer-t1 font-medium text-[15px] px-7 py-3.5 rounded-xl hover:border-foyer-border2 transition-colors">
            Book a demo
          </button>
        </div>
        <p className="text-xs text-foyer-t3 mt-4">No credit card &middot; Live in 60 seconds &middot; Cancel anytime</p>
      </div>
    </section>
  );
}

/* ======================================================================== */
/*  FOOTER                                                                  */
/* ======================================================================== */

function Footer() {
  return (
    <footer className="bg-foyer-t1 py-6">
      <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <span className="font-display italic text-white/80 text-sm">Foyer</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-white/40">
          {['Product', 'Pricing', 'Docs', 'Privacy', 'Terms'].map(l => (
            <a key={l} href="#" className="hover:text-white/60 transition-colors">{l}</a>
          ))}
        </div>
        <div className="text-right">
          <p className="text-[11px] text-white/30">&copy; 2026 Foyer. All rights reserved.</p>
          <p className="text-[10px] text-white/20 mt-0.5">Powered by LiveKit &middot; Twilio &middot; Supabase</p>
        </div>
      </div>
    </footer>
  );
}

/* ======================================================================== */
/*  MAIN EXPORT                                                             */
/* ======================================================================== */

export default function Landing() {
  return (
    <div className="bg-foyer-bg">
      <Nav />
      <Hero />
      <HowItWorks />
      <Features />
      <MetricsStrip />
      <Testimonials />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
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
  'Appointment booked - Bright Smile Dental · 2m ago',
  'Reschedule handled - City Ortho · 7m ago',
  'FAQ answered - Lakeview Dental · 9m ago',
  'Booking confirmed - Glow Med Spa · 12m ago',
  'New patient intake - Smile Works · 15m ago',
  'Callback scheduled - Metro Dental · 18m ago',
  'Insurance query - Premier Ortho · 21m ago',
  'Appointment booked - Radiance Spa · 24m ago',
  'Follow-up reminder - City Dental · 27m ago',
  'Walk-in converted - Bright Smile · 30m ago',
];

const HERO_TIMELINE_STEPS = [
  {
    key: 'routed',
    title: 'Incoming call routed',
    meta: '0.0s',
    description: 'Foyer answers for Bright Smile Dental the moment the phone rings.',
  },
  {
    key: 'answered',
    title: 'AI receptionist answers',
    meta: '423ms',
    description: 'Greets naturally and confirms the reason for the call.',
  },
  {
    key: 'captured',
    title: 'Appointment captured',
    meta: '18s',
    description: 'Collects the service, date, time, and caller details.',
  },
  {
    key: 'synced',
    title: 'Calendar and notes synced',
    meta: '+0.3s',
    description: 'Calendar and follow-up are updated before the call ends.',
  },
] as const;

const HERO_APPOINTMENT_DETAILS = [
  { label: 'Caller', value: 'Sarah Johnson' },
  { label: 'Service', value: 'Cleaning' },
  { label: 'Date', value: 'Tue Apr 1' },
  { label: 'Time', value: '2:00 PM' },
] as const;

const HERO_CONFIRMATIONS = [
  'Google Calendar updated',
  'Confirmation text queued',
] as const;

const HERO_REASSURANCE_ITEMS = [
  'No code setup',
  'Works 24/7',
  'Cancel anytime',
] as const;

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
      <nav className="mx-auto flex h-[60px] max-w-[1240px] items-center justify-between px-6 lg:px-10 xl:px-14">
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

type TimelineStatus = 'pending' | 'done' | 'active';

const TIMELINE_TIMINGS = [900, 2100, 3400];
const TIMELINE_LOOP = 5600;

function HeroCallCard() {
  const [statuses, setStatuses] = useState<TimelineStatus[]>(['active', 'pending', 'pending', 'pending']);
  const count = 147293;

  useEffect(() => {
    let timeouts: ReturnType<typeof setTimeout>[] = [];
    function run() {
      setStatuses(['active', 'pending', 'pending', 'pending']);
      timeouts = [
        setTimeout(() => setStatuses(['done', 'active', 'pending', 'pending']), TIMELINE_TIMINGS[0]),
        setTimeout(() => setStatuses(['done', 'done', 'active', 'pending']), TIMELINE_TIMINGS[1]),
        setTimeout(() => setStatuses(['done', 'done', 'done', 'active']), TIMELINE_TIMINGS[2]),
        setTimeout(run, TIMELINE_LOOP),
      ];
    }
    run();
    return () => timeouts.forEach(clearTimeout);
  }, []);

  const nodeStyle = (s: TimelineStatus) =>
    s === 'done'
      ? 'border-foyer-green bg-foyer-green text-white'
      : s === 'active'
        ? 'border-foyer-t1 bg-foyer-t1 text-white'
        : 'border-foyer-border bg-foyer-surface text-foyer-t3';

  const lineStyle = (s: TimelineStatus) =>
    s === 'done' ? 'bg-foyer-green-b' : 'bg-foyer-border';

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Main card */}
      <motion.div
        custom={0} variants={fadeUp} initial="hidden" animate="visible"
        className="w-full rounded-[20px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.09)] backdrop-blur-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-[0.7rem] font-semibold text-foyer-t1">Live call · +1 (310) 555-0142</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-600">
            <LivePulseDot /> In progress
          </span>
        </div>

        {/* Timeline */}
        <div className="mt-4 flex flex-col gap-0">

          {/* Step 1 */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500', nodeStyle(statuses[0]))}>
                {statuses[0] === 'done' && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </div>
              <div className={cn('w-0.5 flex-1 my-1 min-h-[6px] transition-all duration-500', lineStyle(statuses[0]))} />
            </div>
            <div className="pb-3 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[0.68rem] font-semibold text-foyer-t1">Call connected</span>
                <span className="text-[0.58rem] text-emerald-500 font-medium">· 0ms</span>
              </div>
              <div className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5">
                <p className="text-[0.58rem] leading-4 text-foyer-t3">Twilio → LiveKit → Bright Smile agent dispatched</p>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500', nodeStyle(statuses[1]))}>
                {statuses[1] === 'done' && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </div>
              <div className={cn('w-0.5 flex-1 my-1 min-h-[6px] transition-all duration-500', lineStyle(statuses[1]))} />
            </div>
            <div className="pb-3 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[0.68rem] font-semibold text-foyer-t1">Agent answered</span>
                <span className="text-[0.58rem] text-emerald-500 font-medium">· 423ms</span>
              </div>
              <div className="mt-1 rounded-lg bg-slate-50 px-2.5 py-2">
                <p className="text-[0.58rem] italic leading-4 text-foyer-t2 mb-1.5">"Hi, thanks for calling Bright Smile Dental! How can I help today?"</p>
                {/* Waveform */}
                <div className="flex items-end gap-[2px] h-4">
                  {[3,5,7,5,8,4,6].map((h, i) => (
                    <span key={i} className="w-[3px] rounded-full bg-emerald-400 animate-foyer-waveform"
                      style={{ height: `${h * 2}px`, '--wave-duration': `${0.6 + i * 0.1}s` } as React.CSSProperties} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500', nodeStyle(statuses[2]))}>
                {statuses[2] === 'done' && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </div>
              <div className={cn('w-0.5 flex-1 my-1 min-h-[6px] transition-all duration-500', lineStyle(statuses[2]))} />
            </div>
            <div className="pb-3 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[0.68rem] font-semibold text-foyer-t1">Appointment captured</span>
                <span className="text-[0.58rem] text-slate-400 font-medium">· 18.2s</span>
              </div>
              <div className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                <div><p className="text-[0.52rem] text-foyer-t3">Name</p><p className="text-[0.6rem] font-medium text-foyer-t1">Sarah Johnson</p></div>
                <div><p className="text-[0.52rem] text-foyer-t3">Service</p><p className="text-[0.6rem] font-medium text-foyer-t1">Cleaning</p></div>
                <div><p className="text-[0.52rem] text-foyer-t3">Date</p><p className="text-[0.6rem] font-medium text-foyer-t1">Tue Apr 1</p></div>
                <div><p className="text-[0.52rem] text-foyer-t3">Time</p><p className="text-[0.6rem] font-medium text-foyer-t1">2:00 PM</p></div>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500', nodeStyle(statuses[3]))}>
                {(statuses[3] === 'done' || statuses[3] === 'active') && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[0.68rem] font-semibold text-foyer-t1">Everything synced</span>
                <span className="text-[0.58rem] text-blue-500 font-medium">· +0.3s</span>
              </div>
              <div className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 space-y-1">
                {['Google Calendar event created', 'Confirmation email dispatched', 'Database & analytics updated'].map(item => (
                  <div key={item} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                    <span className="text-[0.58rem] text-foyer-t2">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </motion.div>

      {/* Counter strip */}
      <motion.div
        custom={1} variants={fadeUp} initial="hidden" animate="visible"
        className="flex w-full items-center justify-between rounded-[16px] border border-slate-200/80 bg-white/95 px-3.5 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <TrendingUp className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="font-mono text-[1rem] font-bold leading-none tracking-[-0.04em] text-slate-800">
              {count.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[0.55rem] text-foyer-t3">appointments booked through Foyer</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-600">
          <LivePulseDot /> Live
        </span>
      </motion.div>
    </div>
  );
}
function HeroSupportStack() {
  const [count, setCount] = useState(147393);
  const handledCalls = useCountUp(142, 1400);
  const bookingRate = useCountUp(41, 1400);

  useEffect(() => {
    const iv = setInterval(() => {
      setCount((current) => current + Math.floor(Math.random() * 3) + 1);
    }, 3200);
    return () => clearInterval(iv);
  }, []);

  const scheduleItems = [
    { color: 'bg-emerald-500', name: 'Sarah Johnson', detail: '2:00 PM - Cleaning' },
    { color: 'bg-sky-400', name: 'Marcus Webb', detail: '3:30 PM - HydraFacial' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[220px] flex-col gap-3 lg:max-w-[240px]">
      <motion.div
        custom={0}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="rounded-[20px] border border-slate-200/80 bg-white/90 p-3.5 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm"
      >
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-foyer-t3">
            Today&apos;s schedule
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-semibold text-emerald-700">
            +3 fresh
          </span>
        </div>
        <div className="mt-3 space-y-2.5">
          {scheduleItems.map((item) => (
            <div key={item.name} className="flex items-start gap-2">
              <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', item.color)} />
              <div>
                <p className="text-[0.75rem] font-medium text-foyer-t1">{item.name}</p>
                <p className="text-[0.7rem] text-foyer-t2">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        custom={1}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="hidden rounded-[34px] border border-slate-200/80 bg-white/90 px-6 py-7 text-center shadow-[0_18px_46px_rgba(15,23,42,0.09)] backdrop-blur-sm"
      >
        <div className="relative overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(245,252,248,0.94))] p-5 shadow-[0_26px_72px_rgba(16,185,129,0.12)] backdrop-blur-sm">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.12),transparent_34%)]" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-foyer-t3">
                Today's schedule
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                +3 fresh
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {scheduleItems.map((item) => (
                <div key={item.name} className="rounded-2xl bg-white/72 px-3.5 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)] backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', item.color)} />
                    <div>
                      <p className="text-[13.5px] font-semibold text-foyer-t1">
                        {item.name}
                      </p>
                      <p className="mt-1 text-[11px] text-foyer-t2">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3.5 py-3 text-[12px] font-medium text-emerald-800">
              Calendar confirmations and reminder texts are queued automatically.
            </div>
          </div>
        </div>
      </motion.div>

      <div className="hidden absolute bottom-0 left-8 w-[17rem] sm:left-10 sm:w-[18.5rem]" style={{ animation: 'foyer-float 12s ease-in-out infinite' }}>
        <div className="relative overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(243,247,255,0.94))] p-5 shadow-[0_26px_72px_rgba(37,99,235,0.14)] backdrop-blur-sm">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.12),transparent_36%)]" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 shadow-inner">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-foyer-t3">
                    Total automated
                  </p>
                  <p className="mt-1 text-[1.8rem] font-semibold leading-none tracking-[-0.05em] text-foyer-t1">
                    {count.toLocaleString()}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-[10px] font-semibold text-emerald-700">
                <LivePulseDot /> Live
              </span>
            </div>
            <p className="mt-4 text-[13px] leading-6 text-foyer-t2">
              Bookings, reminders, and follow-up updates are being handled around the clock.
            </p>
            <div className="mt-4 flex items-end gap-1.5">
              {[34, 52, 46, 64, 58, 82, 74, 96].map((height, index) => (
                <span
                  key={height}
                  className={cn(
                    'flex-1 rounded-full bg-gradient-to-t from-sky-500 via-blue-500 to-violet-500',
                    index < 3 && 'opacity-40'
                  )}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <motion.div
        custom={1}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="rounded-[20px] border border-slate-200/80 bg-white/90 px-4 py-4 text-center shadow-[0_18px_46px_rgba(15,23,42,0.09)] backdrop-blur-sm"
      >
        <p className="text-[2.6rem] font-semibold leading-none tracking-[-0.08em] text-slate-700">
          {handledCalls}
        </p>
        <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-foyer-t3">
          Calls handled
        </p>
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="text-[1.4rem] font-semibold tracking-[-0.06em] text-emerald-500">58</span>
          <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-foyer-t2">Booked</span>
        </div>
      </motion.div>

      <motion.div
        custom={2}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="rounded-[20px] border border-slate-200/80 bg-white/90 p-3.5 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <TrendingUp className="h-3 w-3" />
          </div>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-semibold text-emerald-600">
            <LivePulseDot /> Live
          </span>
        </div>
        <p className="mt-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-foyer-t3">
          Total automated
        </p>
        <p className="mt-1 text-[1.6rem] font-semibold leading-none tracking-[-0.06em] text-slate-700">
          {count.toLocaleString()}
        </p>
        <p className="mt-2 text-[0.7rem] text-foyer-t2">
          Bookings handled 24/7.
        </p>
      </motion.div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#f7f7f4] pb-16 pt-20 lg:pb-28 lg:pt-28">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(255,255,255,0.96),rgba(247,247,244,0.78)_42%,rgba(224,229,255,0.5)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_12%_48%,rgba(190,190,255,0.14),transparent_28%),radial-gradient(circle_at_88%_25%,rgba(167,180,255,0.16),transparent_26%)]" />

      <div className="relative mx-auto grid max-w-[1280px] gap-6 px-6 lg:grid-cols-[300px_minmax(0,1fr)_240px] lg:items-center lg:px-10 xl:px-14">
        <div className="order-2 lg:order-1">
          <HeroCallCard />
        </div>

        <div className="order-1 text-center lg:order-2">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible" className="flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-5 py-2 text-sm font-medium text-emerald-700 shadow-[0_10px_30px_rgba(34,197,94,0.08)] backdrop-blur-sm">
              <LivePulseDot /> Now live · Trusted by 40+ businesses
            </span>
          </motion.div>

          <motion.h1
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mx-auto mt-6 max-w-[760px] text-[2rem] font-extrabold leading-[0.92] tracking-[-0.08em] text-[#0f1115] sm:text-[2.4rem] lg:text-[2.9rem] xl:text-[3.4rem]"
          >
            <span className="block">Your calls.</span>
            <span
              className="mt-2 block text-[1.8rem] font-medium leading-none tracking-[-0.04em] text-[#1757f6] sm:text-[2.2rem] lg:text-[2.7rem] xl:text-[3.1rem]"
              style={{ fontFamily: '"Caveat", cursive' }}
            >
              Answered perfectly.
            </span>
            <span className="mt-2 block">Every time.</span>
          </motion.h1>

          <motion.p
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mx-auto mt-5 max-w-[520px] text-[0.82rem] leading-6 text-slate-600 sm:text-[0.9rem]"
          >
            Deploy an AI receptionist in 60 seconds. It books appointments, handles questions, and syncs your calendar - 24/7.
          </motion.p>

          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible" className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex min-h-[56px] items-center gap-3 rounded-full bg-[#111111] px-8 py-4 text-[1.05rem] font-semibold text-white shadow-[0_16px_40px_rgba(17,17,17,0.2)] transition-transform duration-200 hover:-translate-y-0.5"
            >
              Deploy your agent <ArrowRight className="h-5 w-5" />
            </Link>
            <button className="inline-flex min-h-[56px] items-center justify-center rounded-full border border-slate-200 bg-white/70 px-8 py-4 text-[1.05rem] font-medium text-slate-700 shadow-[0_10px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm transition-colors hover:border-slate-300">
              Watch demo
            </button>
          </motion.div>

          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible" className="mt-11 flex flex-col items-center gap-4">
            <div className="flex items-center">
              {[
                'from-[#c58f62] to-[#6d4c41]',
                'from-[#5b718d] to-[#29465b]',
                'from-[#dfb07b] to-[#825b3c]',
              ].map((gradient, index) => (
                <div
                  key={gradient}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-[#f7f7f4] bg-gradient-to-br text-xs font-semibold text-white shadow-sm',
                    gradient,
                    index > 0 && '-ml-2.5'
                  )}
                >
                  {['SJ', 'MW', 'LP'][index]}
                </div>
              ))}
              <div className="-ml-2.5 flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-[#f7f7f4] bg-[#2563eb] text-sm font-semibold text-white shadow-sm">
                40+
              </div>
            </div>
            <p className="text-[1rem] text-slate-600">
              Joined by <span className="font-semibold text-slate-900">40+ clinics &amp; spas</span>
            </p>
          </motion.div>
        </div>

        <div className="order-3">
          <HeroSupportStack />
        </div>
      </div>
    </section>
  );
}

function HeroWorkflowCard() {
  const [statuses, setStatuses] = useState<TimelineStatus[]>(['active', 'pending', 'pending', 'pending']);

  useEffect(() => {
    let timeouts: ReturnType<typeof setTimeout>[] = [];

    function run() {
      setStatuses(['active', 'pending', 'pending', 'pending']);
      timeouts = [
        setTimeout(() => setStatuses(['done', 'active', 'pending', 'pending']), TIMELINE_TIMINGS[0]),
        setTimeout(() => setStatuses(['done', 'done', 'active', 'pending']), TIMELINE_TIMINGS[1]),
        setTimeout(() => setStatuses(['done', 'done', 'done', 'active']), TIMELINE_TIMINGS[2]),
        setTimeout(run, TIMELINE_LOOP),
      ];
    }

    run();
    return () => timeouts.forEach(clearTimeout);
  }, []);

  const nodeStyle = (status: TimelineStatus) =>
    status === 'done'
      ? 'border-foyer-green bg-foyer-green text-white'
      : status === 'active'
        ? 'border-foyer-t1 bg-foyer-t1 text-white'
        : 'border-foyer-border bg-foyer-surface text-foyer-t3';

  const lineStyle = (status: TimelineStatus) =>
    status === 'done' ? 'bg-foyer-green-b' : 'bg-foyer-border';

  return (
    <motion.div
      custom={0}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="foyer-card relative w-full max-w-[456px] overflow-hidden rounded-[22px] border border-foyer-border bg-foyer-surface p-3.5 shadow-[0_22px_52px_rgba(15,23,42,0.065)] sm:p-4"
    >
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-foyer-green-bg to-transparent" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-label uppercase text-foyer-t3 tracking-[0.18em]">Live call workflow</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-foyer-t1 sm:text-[13px]">
              <PhoneCall className="h-3.5 w-3.5 text-foyer-green" />
              <span>Bright Smile Dental</span>
              <span className="text-foyer-t3">&middot;</span>
              <span className="font-medium text-foyer-t2">+1 (310) 555-0142</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-foyer-green-b/70 bg-foyer-green-bg/80 px-2.5 py-1 text-[10px] font-semibold text-foyer-green">
            <LivePulseDot />
            Agent live
          </span>
        </div>

        <div className="mt-3.5 rounded-[18px] border border-foyer-border bg-foyer-surface2 p-3 sm:p-3.5">
          <ol className="space-y-2.5">
            {HERO_TIMELINE_STEPS.map((step, index) => {
              const status = statuses[index];
              const isLastStep = index === HERO_TIMELINE_STEPS.length - 1;

              return (
                <li key={step.key} className="grid grid-cols-[auto,1fr] gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500',
                        nodeStyle(status)
                      )}
                    >
                      {status === 'done' ? (
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      ) : status === 'active' ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      ) : null}
                    </div>
                    {!isLastStep && (
                      <div
                        className={cn(
                          'my-1 min-h-[24px] w-0.5 flex-1 transition-all duration-500',
                          lineStyle(status)
                        )}
                      />
                    )}
                  </div>

                  <div className={cn('min-w-0', !isLastStep && 'pb-1')}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-[12.5px] font-semibold text-foyer-t1 sm:text-[13px]">{step.title}</p>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foyer-green">
                        {step.meta}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-5 text-foyer-t2">{step.description}</p>

                    {step.key === 'captured' && (
                      <div className="mt-2 grid grid-cols-2 gap-2 rounded-[14px] border border-foyer-border bg-foyer-surface px-2.5 py-2">
                        {HERO_APPOINTMENT_DETAILS.map((detail) => (
                          <div key={detail.label}>
                            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-foyer-t3">
                              {detail.label}
                            </p>
                            <p className="mt-0.5 text-[11.5px] font-semibold text-foyer-t1">{detail.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {step.key === 'synced' && (
                      <div className="mt-2 rounded-[14px] border border-foyer-green-b bg-foyer-green-bg px-2.5 py-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foyer-green">
                          <CheckCircle2 className="h-3 w-3" />
                          Synced automatically
                        </div>
                        <div className="mt-1 space-y-1">
                          {HERO_CONFIRMATIONS.map((item) => (
                            <div key={item} className="flex items-center gap-1.5 text-[11.5px] text-foyer-t2">
                              <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-foyer-green" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </motion.div>
  );
}

function PremiumHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden bg-foyer-bg pb-16 pt-[5.5rem] lg:pb-20 lg:pt-28"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.92),transparent_34%),radial-gradient(circle_at_82%_30%,rgba(21,128,61,0.08),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0)_42%)] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.06),transparent_38%),radial-gradient(circle_at_82%_30%,rgba(34,197,94,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)_42%)]" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-foyer-surface" />

      <div className="relative mx-auto grid max-w-[1240px] gap-y-12 px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(400px,0.86fr)] lg:items-center lg:gap-x-24 lg:px-10 xl:gap-x-28 xl:px-14">
        <div className="max-w-[640px]">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <span className="inline-flex items-center gap-2 rounded-full border border-foyer-green-b/70 bg-foyer-green-bg/70 px-3.5 py-1.5 text-[10px] font-semibold text-foyer-green/90">
              <LivePulseDot />
              AI receptionist for clinics and service businesses
            </span>
          </motion.div>

          <motion.h1
            id="hero-heading"
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-5 max-w-[620px] text-[clamp(2.55rem,4vw,4.1rem)] font-extrabold leading-[0.96] tracking-[-0.07em] text-foyer-t1"
          >
            <span className="block">Every call answered.</span>
            <span className="block">Every appointment captured.</span>
          </motion.h1>

          <motion.p
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-5 max-w-[38rem] text-[15px] leading-7 text-foyer-t2 sm:text-[16px]"
          >
            Deploy an AI receptionist in 60 seconds. It answers calls, speaks naturally, books appointments,
            syncs your calendar, and follows up automatically so your business stops missing calls after hours.
          </motion.p>

          <motion.div
            custom={3}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-7 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center"
          >
            <Link
              to="/signup"
              className="inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-full bg-foyer-t1 px-7 text-[15px] font-semibold text-foyer-surface shadow-[0_16px_36px_rgba(26,25,23,0.16)] transition-transform duration-200 hover:-translate-y-0.5"
            >
              Deploy your agent
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-[54px] items-center justify-center rounded-full border border-foyer-border/80 bg-foyer-surface/85 px-7 text-[15px] font-medium text-foyer-t2 transition-colors duration-200 hover:border-foyer-border hover:bg-foyer-surface2 hover:text-foyer-t1"
            >
              See how it works
            </a>
          </motion.div>

          <motion.ul
            custom={4}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-medium text-foyer-t2/80"
          >
            {HERO_REASSURANCE_ITEMS.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-foyer-t3/70" />
                <span>{item}</span>
              </li>
            ))}
          </motion.ul>
        </div>

        <div aria-hidden="true" className="lg:justify-self-end">
          <div className="relative flex flex-col items-stretch lg:items-end">
            <HeroWorkflowCard />
          </div>
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
  { icon: TrendingUp, label: 'Data synced', desc: 'Calendar, email, database - all updated instantly', pill: 'Instant' },
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
            <p className="text-[13.5px] text-foyer-t2 mt-2 leading-relaxed">Track calls, bookings, missed opportunities, and peak hours - updated the moment each call ends.</p>
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
              <p className="text-sm font-bold text-foyer-t1 mt-1">New booking - Sarah Johnson</p>
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
      <PremiumHero />
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


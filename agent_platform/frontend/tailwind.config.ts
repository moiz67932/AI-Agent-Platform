import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        /* ── Landing page (warm off-white) ── */
        'foyer-bg':        'var(--foyer-bg)',
        'foyer-surface':   'var(--foyer-surface)',
        'foyer-surface2':  'var(--foyer-surface2)',
        'foyer-border':    'var(--foyer-border)',
        'foyer-border2':   'var(--foyer-border2)',
        'foyer-t1':        'var(--foyer-t1)',
        'foyer-t2':        'var(--foyer-t2)',
        'foyer-t3':        'var(--foyer-t3)',

        /* ── Semantic accents ── */
        'foyer-blue':      'var(--foyer-blue)',
        'foyer-blue-bg':   'var(--foyer-blue-bg)',
        'foyer-blue-b':    'var(--foyer-blue-b)',
        'foyer-green':     'var(--foyer-green)',
        'foyer-green-bg':  'var(--foyer-green-bg)',
        'foyer-green-b':   'var(--foyer-green-b)',
        'foyer-gdot':      'var(--foyer-gdot)',
        'foyer-purple':    'var(--foyer-purple)',
        'foyer-purple-bg': 'var(--foyer-purple-bg)',
        'foyer-purple-b':  'var(--foyer-purple-b)',
        'foyer-amber':     'var(--foyer-amber)',
        'foyer-amber-bg':  'var(--foyer-amber-bg)',
        'foyer-amber-b':   'var(--foyer-amber-b)',
        'foyer-red':       'var(--foyer-red)',
        'foyer-red-bg':    'var(--foyer-red-bg)',
        'foyer-pink':      'var(--foyer-pink)',
        'foyer-pink-bg':   'var(--foyer-pink-bg)',
        'foyer-pink-b':    'var(--foyer-pink-b)',

        /* ── Dashboard (lavender) ── */
        'dash-bg':         'var(--dash-bg)',
        'dash-surface':    'var(--dash-surface)',
        'dash-card':       'var(--dash-card)',
        'dash-border':     'var(--dash-border)',
        'dash-t1':         'var(--dash-t1)',
        'dash-t2':         'var(--dash-t2)',
        'dash-t3':         'var(--dash-t3)',
        'dash-blue':       'var(--dash-blue)',
        'dash-blue-bg':    'var(--dash-blue-bg)',
        'dash-blue-b':     'var(--dash-blue-b)',
        'dash-green':      'var(--dash-green)',
        'dash-green-bg':   'var(--dash-green-bg)',
        'dash-green-b':    'var(--dash-green-b)',
        'dash-gdot':       'var(--dash-gdot)',
        'dash-pink':       'var(--dash-pink)',
        'dash-pink-bg':    'var(--dash-pink-bg)',
        'dash-pink-b':     'var(--dash-pink-b)',
        'dash-amber':      'var(--dash-amber)',
        'dash-amber-bg':   'var(--dash-amber-bg)',
        'dash-amber-b':    'var(--dash-amber-b)',
        'dash-purple':     'var(--dash-purple)',
        'dash-purple-bg':  'var(--dash-purple-bg)',
        'dash-purple-b':   'var(--dash-purple-b)',
      },
      borderRadius: {
        lg: '14px',
        md: '10px',
        sm: '6px',
        xl: '18px',
        '2xl': '24px',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        'hero':       ['68px', { lineHeight: '1.02', letterSpacing: '-3px', fontWeight: '800' }],
        'hero-sm':    ['48px', { lineHeight: '1.05', letterSpacing: '-2px', fontWeight: '800' }],
        'section':    ['40px', { lineHeight: '1.1',  letterSpacing: '-1.5px', fontWeight: '800' }],
        'section-sm': ['28px', { lineHeight: '1.15', letterSpacing: '-1px', fontWeight: '800' }],
        'metric-big': ['52px', { lineHeight: '1',    letterSpacing: '-3px', fontWeight: '800' }],
        'metric':     ['32px', { lineHeight: '1.1',  letterSpacing: '-1.5px', fontWeight: '800' }],
        'card-title': ['15px', { lineHeight: '1.3',  fontWeight: '700' }],
        'body':       ['14px', { lineHeight: '1.65', fontWeight: '400' }],
        'label':      ['10px', { lineHeight: '1',    letterSpacing: '0.06em', fontWeight: '600' }],
      },
      transitionTimingFunction: {
        'foyer': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'foyer-pulse':    'foyer-pulse 2s infinite',
        'foyer-shimmer':  'foyer-shimmer 1.5s ease-in-out infinite',
        'foyer-ticker':   'foyer-ticker 28s linear infinite',
        'foyer-fade-in':  'foyer-fade-in-up 0.6s var(--foyer-ease) forwards',
        'foyer-waveform': 'foyer-waveform var(--wave-duration, 0.8s) ease-in-out infinite',
        'foyer-slide-right': 'foyer-slide-in-right 0.3s var(--foyer-ease) forwards',
      },
      keyframes: {
        'foyer-pulse': {
          '0%':   { boxShadow: '0 0 0 0 rgba(34,197,94,0.45)' },
          '70%':  { boxShadow: '0 0 0 8px rgba(34,197,94,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(34,197,94,0)' },
        },
        'foyer-shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'foyer-ticker': {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'foyer-fade-in-up': {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'foyer-waveform': {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%':      { transform: 'scaleY(1)' },
        },
        'foyer-slide-in-right': {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'foyer-blink': {
          '0%, 50%':  { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;

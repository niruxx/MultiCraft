/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        surface: {
          950: '#08090d',
          900: '#0f1218',
          850: '#141821',
          800: '#191e28',
          700: '#232a37',
          600: '#333c4c',
          500: '#4a5568',
        },
        accent: {
          400: '#34e0a1',
          500: '#22d3a5',
          600: '#14b891',
          glow: '#34e0a1',
        },
        brand: {
          from: '#34e0a1',
          via: '#22d3ee',
          to: '#818cf8',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(52,224,161,0.15), 0 8px 24px -4px rgba(34,211,165,0.25)',
        'glow-lg': '0 0 40px -8px rgba(34,211,165,0.35)',
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -12px rgba(0,0,0,0.5)',
        'inner-border': 'inset 0 0 0 1px rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(115deg, #34e0a1 0%, #22d3ee 50%, #818cf8 100%)',
        'radial-fade': 'radial-gradient(60% 60% at 50% 0%, rgba(34,211,165,0.16) 0%, rgba(8,9,13,0) 70%)',
        'grid-pattern':
          'linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'fade-in-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        'scale-in': { from: { opacity: 0, transform: 'scale(0.96)' }, to: { opacity: 1, transform: 'scale(1)' } },
        shimmer: { from: { backgroundPosition: '-400px 0' }, to: { backgroundPosition: '400px 0' } },
        'pulse-soft': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.45 } },
        'gradient-x': { '0%, 100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        'ping-slow': { '0%': { transform: 'scale(1)', opacity: 0.6 }, '100%': { transform: 'scale(2.4)', opacity: 0 } },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'fade-in-up': 'fade-in-up 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.16,1,0.3,1) both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'gradient-x': 'gradient-x 6s ease infinite',
        float: 'float 5s ease-in-out infinite',
        'ping-slow': 'ping-slow 1.8s cubic-bezier(0,0,0.2,1) infinite',
      },
    },
  },
  plugins: [],
};

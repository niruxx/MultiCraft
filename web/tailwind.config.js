/** @type {import('tailwindcss').Config} */
function themeColor(name) {
  return ({ opacityValue }) => `rgb(var(--${name}) / ${opacityValue})`;
}

function themeScale(prefix, steps) {
  return Object.fromEntries(steps.map((step) => [step, themeColor(`${prefix}-${step}`)]));
}

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // All theme-sensitive colors resolve through CSS variables (defined per [data-theme]
        // in index.css) so a single class like `bg-surface-900` or `text-ink-200` automatically
        // repaints when the user switches light/dark — nothing in components needs to change.
        surface: themeScale('surface', [950, 900, 850, 800, 700, 600, 500]),
        ink: themeScale('ink', [50, 100, 200, 300, 400, 500, 600]),
        accent: themeScale('accent', [400, 500, 600]),
        success: themeScale('success', [400, 500]),
      },
      boxShadow: {
        // Flat, neutral elevation — no colored glow. Depth comes from blur + a hairline
        // border, not drop shadows, to keep surfaces reading flat rather than skeuomorphic.
        flat: '0 1px 2px rgba(0,0,0,0.2)',
        card: '0 4px 20px -6px rgba(0,0,0,0.35)',
        glow: '0 4px 24px -4px rgb(var(--accent-500) / 0.35)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'fade-in-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        'scale-in': { from: { opacity: 0, transform: 'scale(0.96)' }, to: { opacity: 1, transform: 'scale(1)' } },
        shimmer: { from: { backgroundPosition: '-400px 0' }, to: { backgroundPosition: '400px 0' } },
        'pulse-soft': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.45 } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        'ping-slow': { '0%': { transform: 'scale(1)', opacity: 0.6 }, '100%': { transform: 'scale(2.4)', opacity: 0 } },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'fade-in-up': 'fade-in-up 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.16,1,0.3,1) both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        float: 'float 5s ease-in-out infinite',
        'ping-slow': 'ping-slow 1.8s cubic-bezier(0,0,0.2,1) infinite',
      },
    },
  },
  plugins: [],
};

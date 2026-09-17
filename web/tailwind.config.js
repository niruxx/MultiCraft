/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#0b0e11',
          900: '#12161b',
          800: '#1a1f26',
          700: '#242b34',
          600: '#333c47',
        },
        accent: {
          500: '#4ade80',
          600: '#22c55e',
        },
      },
    },
  },
  plugins: [],
};

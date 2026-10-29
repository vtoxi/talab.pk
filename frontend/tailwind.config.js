/** Design tokens: large type, big touch targets, high contrast, RTL-safe (use ms-/me-/ps-/pe- utilities). */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#ecfdf5', 100: '#d1fae5', 500: '#059669', 600: '#047857', 700: '#065f46' },
        ink: { DEFAULT: '#111827', soft: '#4b5563' },
        danger: { 50: '#fef2f2', 600: '#b91c1c' },
        warn: { 50: '#fffbeb', 600: '#b45309' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      fontSize: { base: ['1.125rem', '1.75rem'], lg: ['1.375rem', '2rem'], xl: ['1.75rem', '2.25rem'] },
      minHeight: { touch: '3.5rem' },
      borderRadius: { card: '1rem' },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      // Maps the design tokens in src/index.css (:root CSS vars) to Tailwind
      // color utilities. Without this, classes like `text-terminal-text` /
      // `bg-terminal-bg` are no-ops (e.g. raw <input>s rendered with an unreadable
      // default background). `<alpha-value>` keeps `/opacity` modifiers working.
      colors: {
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          hover: 'hsl(var(--accent-hover) / <alpha-value>)',
        },
        terminal: {
          bg: 'hsl(var(--bg) / <alpha-value>)',
          card: 'hsl(var(--panel) / <alpha-value>)',
          input: 'hsl(var(--input-bg) / <alpha-value>)',
          border: 'hsl(var(--border) / <alpha-value>)',
          text: 'hsl(var(--text) / <alpha-value>)',
          'text-secondary': 'hsl(var(--text-muted) / <alpha-value>)',
          success: 'hsl(var(--success) / <alpha-value>)',
          'focus-ring': 'hsl(var(--focus-ring) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
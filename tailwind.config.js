/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        m3: {
          bg: '#0B0D0E',
          surfaceLow: '#111517',
          surface: '#161B1E',
          surfaceHigh: '#1D2428',
          surfaceHighest: '#252E33',
          primary: '#5EEAD4',
          primaryContainer: '#0F2E2A',
          onPrimaryContainer: '#99F6E4',
          secondaryContainer: '#2B2211',
          onSecondaryContainer: '#FDE68A',
          tertiaryContainer: '#122533',
          onTertiaryContainer: '#BAE6FD',
        },
      },
    },
  },
  plugins: [],
};

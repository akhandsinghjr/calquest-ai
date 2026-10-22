/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        m3: {
          surface: '#14100E',
          surfaceLow: '#1C1613',
          surfaceContainer: '#241C18',
          surfaceHigh: '#2E241F',
          surfaceHighest: '#3A2E27',
          primary: '#F4845F',
          primarySoft: '#F7A072',
          primaryContainer: '#3D2219',
          onPrimaryContainer: '#FFD8C7',
          secondaryContainer: '#332721',
          cream: '#FAF3EE',
          sand: '#D8C7B8',
          muted: '#9E8C7E',
          amber: '#F6BD60',
          rose: '#E56B6F',
          sage: '#84A59D',
        },
      },
      borderRadius: {
        '3xl': '28px',
        '4xl': '36px',
        '5xl': '44px',
      },
    },
  },
  plugins: [],
};

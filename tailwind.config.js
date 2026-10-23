/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        noir: { 950: '#0b0a09', 900: '#141210', 800: '#1d1a17', 700: '#2a2622', 600: '#3a342e' },
        gold: { 300: '#ecd38f', 400: '#d9b75f', 500: '#c49a3a', 600: '#9c7a2c' },
        blood: { 500: '#a3352b', 400: '#c4483c' },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

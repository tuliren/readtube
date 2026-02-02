/** @type {import('tailwindcss').Config} */
const { MAIN_COLOR, MINOR_COLOR } = require('./src/constants');

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: 'var(--font-inter)',
        display: 'var(--font-lexend)',
      },
    },
  },
};

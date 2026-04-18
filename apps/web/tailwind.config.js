/** @type {import('tailwindcss').Config} */
const { MOBILE_BREAKPOINT } = require('./src/lib/breakpoints');

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // `sidebar:` is the unified compact/expanded breakpoint — it
      // lines up with SidebarContext's matchMedia threshold so the CSS
      // switch fires in the same frame as the JS one.
      screens: {
        sidebar: `${MOBILE_BREAKPOINT}px`,
      },
      fontFamily: {
        sans: 'var(--font-inter)',
        display: 'var(--font-lexend)',
      },
    },
  },
};

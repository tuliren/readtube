const nextConfig = require('@repo/eslint-config/next.js');
const globals = require('globals');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...nextConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
  {
    ignores: ['eslint.config.js'],
  },
];

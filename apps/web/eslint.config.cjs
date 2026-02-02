const storybook = require('eslint-plugin-storybook');
const nextConfig = require('@repo/eslint-config/next.js');
const globals = require('globals');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...nextConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
      },
    },
    rules: {
      '@next/next/no-img-element': 'off',
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: true,
        },
      ],
    },
  },
  {
    files: ['**/*.stories.tsx', '**/*.stories.ts'],
    rules: {
      'import-x/named': 'off',
    },
  },
  ...storybook.configs['flat/recommended'],
  {
    ignores: [
      'eslint.config.js',
      '*.config.js',
      '*.config.cjs',
      '*.config.mjs',
      '.storybook/**',
      '.next',
    ],
  },
];

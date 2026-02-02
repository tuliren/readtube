const reactInternalConfig = require('@repo/eslint-config/react-internal.js');
const tsparser = require('@typescript-eslint/parser');
const globals = require('globals');
const path = require('node:path');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...reactInternalConfig,
  {
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.lint.json',
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    ignores: ['eslint.config.js', 'jest.config.cjs'],
  },
];

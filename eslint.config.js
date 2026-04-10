// This configuration only applies to the package manager root.
const tsparser = require('@typescript-eslint/parser');
const libraryConfig = require('@readtube/eslint-config/library.js');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...libraryConfig,
  {
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: true,
      },
    },
  },
  {
    ignores: ['apps/**', 'packages/**'],
  },
];

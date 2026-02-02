const { resolve } = require('node:path');
const js = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');
const onlyWarn = require('eslint-plugin-only-warn');
const globals = require('globals');

const project = resolve(process.cwd(), 'tsconfig.json');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    plugins: {
      'only-warn': onlyWarn,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        React: true,
        JSX: true,
      },
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          project,
        },
      },
    },
  },
  {
    ignores: [
      // Ignore dotfiles
      '**/.*.js',
      '**/node_modules/',
      '**/dist/',
    ],
  },
];

const { resolve } = require('node:path');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const onlyWarn = require('eslint-plugin-only-warn');
const globals = require('globals');
const typescriptConfig = require('./typescript.js');

const project = resolve(process.cwd(), 'tsconfig.json');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...typescriptConfig,
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    plugins: {
      react,
      'react-hooks': reactHooks,
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
      react: {
        version: 'detect',
      },
      'import-x/resolver': {
        typescript: {
          project,
        },
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
    },
  },
];

const js = require('@eslint/js');
const importPlugin = require('eslint-plugin-import-x');
const turboPlugin = require('eslint-plugin-turbo');
const prettierConfig = require('eslint-config-prettier');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  js.configs.recommended,
  prettierConfig,
  {
    plugins: {
      'import-x': importPlugin,
      turbo: turboPlugin,
    },
    rules: {
      // Import plugin recommended rules
      'import-x/no-unresolved': 'error',
      'import-x/named': 'error',
      'import-x/namespace': 'error',
      'import-x/default': 'error',
      'import-x/export': 'error',
      'import-x/no-named-as-default': 'warn',
      'import-x/no-named-as-default-member': 'warn',
      'import-x/no-deprecated': 'warn',
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/tests/**/*.ts',
            '**/tests/**/*.tsx',
            '**/__tests__/**/*.ts',
            '**/__tests__/**/*.tsx',
            '**/__integrationTests__/**/*.ts',
            '**/__integrationTests__/**/*.tsx',
            '**/stories/**/*.ts',
            '**/stories/**/*.tsx',
            '**/__stories__/**/*.tsx',
            '**/__stories__/**/*.ts',
            '**/scripts/**/*.ts',
            '**/jest.integration.setup.ts',
          ],
          optionalDependencies: false,
          peerDependencies: true,
        },
      ],
      'import-x/no-mutable-exports': 'warn',
      'import-x/no-cycle': 'error',
      // Turbo rules
      ...turboPlugin.configs.recommended.rules,
      // Base rules
      'no-unused-vars': 'off',
      'no-empty-pattern': 'off',
      curly: 'error',
      'eol-last': ['error', 'always'],
    },
  },
  {
    ignores: [
      // Ignore dotfiles
      '**/.*.js',
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      '**/storybook-static/',
    ],
  },
];

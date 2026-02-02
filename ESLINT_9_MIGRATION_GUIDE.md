# ESLint 8 to 9 Migration Guide for LLM Agents

This guide provides step-by-step instructions for migrating a monorepo from ESLint 8 to ESLint 9 using the flat config format.

## Overview

ESLint 9 introduces a new "flat config" format (`eslint.config.cjs`) that replaces the legacy `.eslintrc.*` format. This migration involves:

1. Updating ESLint and plugin versions
2. Converting all `.eslintrc.js` files to `eslint.config.cjs` (flat config)
3. Replacing incompatible plugins
4. Updating configuration syntax
5. Testing and fixing issues

## Prerequisites

- Understand the monorepo structure (workspaces, packages)
- Identify all ESLint configuration files
- Note all ESLint plugins and their versions

## Step 1: Update Package Versions

### 1.1 Update Core ESLint Packages

In all `package.json` files that have ESLint:

```json
{
  "devDependencies": {
    "eslint": "^9.0.0"
  }
}
```

### 1.2 Update TypeScript ESLint Packages

For TypeScript support with TS 5.6+:

```json
{
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.18.2",
    "@typescript-eslint/parser": "^8.18.2"
  }
}
```

### 1.3 Replace Incompatible Plugins

**CRITICAL**: `eslint-plugin-import` does NOT support ESLint 9. Replace it with `eslint-plugin-import-x`:

```json
{
  "devDependencies": {
    "eslint-plugin-import-x": "^4.6.2"  // NOT eslint-plugin-import
  }
}
```

### 1.4 Update Other Plugins

```json
{
  "devDependencies": {
    "@eslint/js": "^9.0.0",           // New requirement for flat config
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-turbo": "^2.3.3",
    "globals": "^15.0.0"              // For managing global variables
  }
}
```

## Step 2: Convert Configuration Files

### 2.1 Understanding Flat Config Structure

Flat config exports an **array** of configuration objects:

```javascript
/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  // Config object 1
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { ... },
    rules: { ... }
  },
  // Config object 2
  {
    files: ['**/*.js'],
    rules: { ... }
  },
  // Ignores
  {
    ignores: ['dist/**', 'node_modules/**']
  }
];
```

### 2.2 Key Syntax Changes

| ESLint 8 (`.eslintrc.js`)          | ESLint 9 (flat config)                    |
|------------------------------------|-------------------------------------------|
| `extends: ['plugin:foo/bar']`      | Import and spread: `...foo.configs.bar`   |
| `plugins: ['foo']`                 | `plugins: { foo: fooPlugin }`             |
| `env: { browser: true }`           | `languageOptions: { globals: { ...globals.browser } }` |
| `parser: '@typescript-eslint/parser'` | `languageOptions: { parser: tsparser }` |
| `parserOptions: { ... }`           | `languageOptions: { parserOptions: { ... } }` |
| `ignorePatterns: ['dist/']`        | Separate config: `{ ignores: ['dist/'] }` |

### 2.3 Example: Base Config Conversion

**Before (ESLint 8):**
```javascript
// packages/eslint-config/base.js
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'prettier'
  ],
  plugins: ['import', 'turbo'],
  ignorePatterns: ['node_modules/', 'dist/'],
  rules: {
    'no-unused-vars': 'off',
    'import/no-cycle': 'error',
  }
};
```

**After (ESLint 9):**
```javascript
// packages/eslint-config/base.js
const js = require('@eslint/js');
const importPlugin = require('eslint-plugin-import-x');  // NOTE: import-x not import
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
      // Import-x rules (note the import-x/ prefix)
      'import-x/no-unresolved': 'error',
      'import-x/named': 'error',
      'import-x/no-cycle': 'error',
      // Turbo rules
      ...turboPlugin.configs.recommended.rules,
      // Base rules
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: ['**/node_modules/', '**/dist/'],
  },
];
```

### 2.4 Example: TypeScript Config Conversion

**Before (ESLint 8):**
```javascript
// packages/eslint-config/typescript.js
const { resolve } = require('node:path');
const project = resolve(process.cwd(), 'tsconfig.json');

module.exports = {
  extends: ['./base.js'],
  parser: '@typescript-eslint/parser',
  parserOptions: { project },
  plugins: ['@typescript-eslint', 'import'],
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
    'import/resolver': {
      typescript: { project }
    }
  }
};
```

**After (ESLint 9):**
```javascript
// packages/eslint-config/typescript.js
const { resolve } = require('node:path');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const baseConfig = require('./base.js');

const project = resolve(process.cwd(), 'tsconfig.json');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...baseConfig,  // Spread the base config array
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    settings: {
      'import-x/parsers': {  // NOTE: import-x not import
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
      'import-x/resolver': {  // NOTE: import-x not import
        typescript: { project }
      }
    }
  }
];
```

### 2.5 Example: React Config Conversion

**Before (ESLint 8):**
```javascript
module.exports = {
  extends: [
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    './typescript.js'
  ],
  plugins: ['react', 'react-hooks', 'only-warn'],
  env: { browser: true },
  globals: { React: true, JSX: true },
  settings: {
    react: { version: 'detect' }
  }
};
```

**After (ESLint 9):**
```javascript
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const onlyWarn = require('eslint-plugin-only-warn');
const globals = require('globals');
const typescriptConfig = require('./typescript.js');

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
        ...globals.browser,
        React: true,
        JSX: true,
      },
    },
    settings: {
      react: { version: 'detect' },
      'import-x/resolver': {
        typescript: { project }
      }
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
    }
  }
];
```

### 2.6 Example: App-Level Config

**Before (ESLint 8):**
```javascript
// apps/web/.eslintrc.js
module.exports = {
  root: true,
  extends: ['@repo/eslint-config/next.js'],
  env: { browser: true, jest: true },
  rules: {
    '@next/next/no-img-element': 'off'
  }
};
```

**After (ESLint 9):**
```javascript
// apps/web/eslint.config.cjs
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
    },
  },
  {
    ignores: ['eslint.config.cjs', '*.config.js', '.storybook/**'],
  },
];
```

## Step 3: Update Import Rule Names

When switching from `eslint-plugin-import` to `eslint-plugin-import-x`, update ALL rule names:

- `import/` → `import-x/`

Examples:
- `import/no-cycle` → `import-x/no-cycle`
- `import/no-extraneous-dependencies` → `import-x/no-extraneous-dependencies`
- `import/named` → `import-x/named`

## Step 4: Update Lint Scripts

For Next.js apps, replace `next lint` with direct `eslint` command:

```json
{
  "scripts": {
    "lint": "eslint ."  // Instead of "next lint"
  }
}
```

Keep `next lint` only if you're on Next.js 15+ which supports ESLint 9.

## Step 5: Handle Common Issues

### Issue 1: Config Files Being Linted

**Problem:** ESLint tries to lint `eslint.config.cjs` itself and fails.

**Solution:** Add config files to ignore list:

```javascript
{
  ignores: [
    'eslint.config.cjs',
    '*.config.js',
    '*.config.cjs',
    '*.config.mjs',
    '.storybook/**'
  ]
}
```

### Issue 2: Files Not Found in TypeScript Project

**Problem:** `"parserOptions.project" has been provided but file not found in project`

**Solution:** Either:
1. Add files to `tsconfig.json` include
2. Or add to ignore list
3. Or use `tsconfig.lint.json` with broader includes

### Issue 3: Storybook Type Imports Warnings

**Problem:** `Meta not found in '@storybook/react'` warnings

**Solution:** Disable the rule for story files:

```javascript
{
  files: ['**/*.stories.tsx', '**/*.stories.ts'],
  rules: {
    'import-x/named': 'off',
  }
}
```

### Issue 4: Plugin Not Found Errors

**Problem:** `could not find plugin "import"`

**Solution:** Ensure you're using the correct plugin name in the `plugins` object. The plugin key doesn't have to match the package name:

```javascript
plugins: {
  'import-x': importPlugin,  // Plugin key is 'import-x'
}
```

## Step 6: Install and Test

### 6.1 Install Dependencies

```bash
yarn install
```

### 6.2 Test Linting

```bash
yarn lint
```

### 6.3 Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `TypeError: context.getAncestors is not a function` | Using old `eslint-plugin-import` | Use `eslint-plugin-import-x` |
| `Unknown options: useEslintrc, extensions` | Using `next lint` with Next.js 14 | Change to `eslint .` |
| `WARNING: Your TypeScript version not supported` | Old TypeScript ESLint packages | Update to `@typescript-eslint/*@^8.18.2` |

## Step 7: Clean Up Old Files

After successful migration:

```bash
# Remove old .eslintrc.js files
find . -name ".eslintrc.js" -not -path "*/node_modules/*" -delete
```

## Complete Checklist

- [ ] Update all `eslint` versions to `^9.0.0`
- [ ] Update `@typescript-eslint/*` to `^8.18.2` or later
- [ ] Replace `eslint-plugin-import` with `eslint-plugin-import-x`
- [ ] Add `@eslint/js` and `globals` packages
- [ ] Convert all `.eslintrc.js` to `eslint.config.cjs` format
- [ ] Update all `import/` rules to `import-x/`
- [ ] Update `import/resolver` settings to `import-x/resolver`
- [ ] Convert `extends` arrays to config spreads
- [ ] Convert `plugins` arrays to plugin objects
- [ ] Convert `env` to `languageOptions.globals`
- [ ] Convert `parser` to `languageOptions.parser`
- [ ] Move `ignorePatterns` to separate `{ ignores: [...] }` object
- [ ] Update lint scripts (replace `next lint` with `eslint .` if needed)
- [ ] Add config files to ignore list
- [ ] Test linting with `yarn lint`
- [ ] Delete old `.eslintrc.js` files
- [ ] Commit and push changes

## Migration Command Template

Here's a template prompt for an LLM agent:

```
Migrate this monorepo from ESLint 8 to ESLint 9 following these steps:

1. Update ESLint to ^9.0.0 in all package.json files
2. Update @typescript-eslint packages to ^8.18.2
3. Replace eslint-plugin-import with eslint-plugin-import-x@^4.6.2
4. Add @eslint/js@^9.0.0 and globals@^15.0.0
5. Update eslint-plugin-react-hooks to ^5.0.0
6. Convert all .eslintrc.js files to eslint.config.cjs using flat config format
7. Update all import/ rules to import-x/
8. Replace "next lint" with "eslint ." in Next.js apps (if Next.js < 15)
9. Add config files to ignore patterns
10. Test with yarn lint and fix any issues
11. Delete old .eslintrc.js files
12. Commit and push changes

Follow the ESLint 9 flat config syntax:
- Export an array of config objects
- Use require() to import plugins, not extends strings
- Use plugins object: { 'plugin-name': pluginModule }
- Use languageOptions.globals instead of env
- Use languageOptions.parser instead of parser string
- Put ignores in separate config object

Keep all existing rules and behaviors.
```

## Reference Links

- [ESLint 9 Migration Guide](https://eslint.org/docs/latest/use/migrate-to-9.0.0)
- [Flat Config Documentation](https://eslint.org/docs/latest/use/configure/configuration-files)
- [eslint-plugin-import-x](https://github.com/un-es/eslint-plugin-import-x)

## Notes

- ESLint 9 is more strict about configuration - small errors that were warnings in v8 may be errors in v9
- The flat config format is required in ESLint 9, `.eslintrc.*` is no longer supported
- Always test thoroughly after migration
- Consider creating a backup branch before starting migration

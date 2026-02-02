# `@turbo/eslint-config`

Collection of internal eslint configurations.

| File | Extend | Exported | Config Target |
| ---- | ---- | ---- | ---- |
| `base.js` | | `false` | Shared configuration for all projects. This file is not exported, but extended by others. |
| `typescript.js` | `base.js` | `false` | Config for TypeScript projects. |
| `react-internal.js` | `typescript.js` | `true` | Config for React internal libraries. |
| `nextjs.js` | `typescript.js` | `true` | Config for for Nextjs projects. |
| `server.js` | `typescript.js` | `true` | Config for non-Nextjs servers. |

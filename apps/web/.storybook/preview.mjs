import { ClerkProvider } from '@clerk/nextjs';
import 'katex/dist/katex.min.css';
import React from 'react';

import '@/styles/globals.css';
import '@/styles/tailwind.css';

export const parameters = {
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

// Stories that use components touching Clerk hooks (useAuth, useUser,
// etc.) need a provider in the tree. There's no publishable key in
// Storybook, so we use Clerk's bypass flag to mount the provider
// without requiring a real key.
export const decorators = [
  (Story) =>
    React.createElement(
      ClerkProvider,
      { __internal_bypassMissingPublishableKey: true },
      React.createElement(Story)
    ),
];

export const tags = ['autodocs'];

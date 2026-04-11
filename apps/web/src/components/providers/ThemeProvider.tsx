'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type * as React from 'react';

/**
 * App-wide theme provider. Uses next-themes to manage the `.dark` class on
 * <html>, which pairs with the `@custom-variant dark` declaration in
 * tailwind.css. The initial theme is read from localStorage on the client
 * and persisted across reloads. Stream D wires a server-side mirror into
 * UserPreference so the preference follows users across devices.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

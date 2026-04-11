'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

/**
 * Keyboard shortcut registry. Each feature stream registers its shortcuts
 * on mount via `useShortcut(keys, handler, description)`; the cheatsheet
 * dialog (triggered by "?") reads from this registry to render the list.
 *
 * Rationale for a central registry rather than bare `useHotkeys` calls
 * everywhere: the cheatsheet needs to enumerate shortcuts, and the user
 * should see one authoritative list instead of chasing them through the
 * codebase.
 */

export interface ShortcutInfo {
  id: string;
  keys: string;
  description: string;
}

interface ShortcutContextValue {
  shortcuts: ShortcutInfo[];
  register: (info: ShortcutInfo) => void;
  unregister: (id: string) => void;
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [shortcuts, setShortcuts] = useState<ShortcutInfo[]>([]);

  const register = useCallback((info: ShortcutInfo) => {
    setShortcuts((prev) => {
      if (prev.some((s) => s.id === info.id)) {
        return prev;
      }
      return [...prev, info];
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const value = useMemo<ShortcutContextValue>(
    () => ({ shortcuts, register, unregister }),
    [shortcuts, register, unregister]
  );

  return <ShortcutContext.Provider value={value}>{children}</ShortcutContext.Provider>;
}

/**
 * Register a keyboard shortcut AND a cheatsheet entry in one call.
 * The handler runs inside a useHotkeys hook so it respects react-hotkeys-hook's
 * input-field filtering (ignored in inputs/textareas unless `allowInput` is set).
 */
export function useShortcut(
  id: string,
  keys: string,
  description: string,
  handler: () => void,
  options: { allowInput?: boolean } = {}
): void {
  const context = useContext(ShortcutContext);

  useHotkeys(
    keys,
    (event) => {
      event.preventDefault();
      handler();
    },
    {
      enableOnFormTags: options.allowInput === true,
    },
    [handler, options.allowInput]
  );

  if (context == null) {
    throw new Error('useShortcut must be used inside <KeyboardShortcutsProvider>');
  }
  const { register, unregister } = context;

  useEffect(() => {
    register({ id, keys, description });
    return () => unregister(id);
  }, [id, keys, description, register, unregister]);
}

/**
 * Read the list of registered shortcuts for rendering the cheatsheet.
 * Returns an empty array if called outside a provider, so the cheatsheet
 * component can noop safely.
 */
export function useShortcutList(): ShortcutInfo[] {
  const context = useContext(ShortcutContext);
  return context?.shortcuts ?? [];
}

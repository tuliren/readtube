'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

/**
 * ⌘K command palette. Each feature stream calls `useCommand(...)` in its
 * components to push items into the global registry; those items render
 * inside the palette grouped by category, with a run-handler fired on
 * selection.
 *
 * The palette itself is mounted once at the root of /inbox (in InboxShell)
 * and listens for ⌘K / ctrl+K globally.
 */

export interface CommandItemInfo {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

interface CommandContextValue {
  items: CommandItemInfo[];
  open: boolean;
  setOpen: (open: boolean) => void;
  register: (item: CommandItemInfo) => void;
  unregister: (id: string) => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CommandItemInfo[]>([]);
  const [open, setOpen] = useState(false);

  const register = useCallback((item: CommandItemInfo) => {
    setItems((prev) => {
      if (prev.some((i) => i.id === item.id)) {
        return prev;
      }
      return [...prev, item];
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // Global ⌘K / ctrl+K toggle. Intentionally implemented here rather than
  // via useShortcut so the palette works even if a feature unmounts the
  // KeyboardShortcutsProvider (it's a top-level concern).
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const value = useMemo<CommandContextValue>(
    () => ({ items, open, setOpen, register, unregister }),
    [items, open, register, unregister]
  );

  return (
    <CommandContext.Provider value={value}>
      {children}
      <CommandPaletteDialog />
    </CommandContext.Provider>
  );
}

function CommandPaletteDialog() {
  const context = useContext(CommandContext);
  if (context == null) {
    return null;
  }
  const { items, open, setOpen } = context;

  // Group items by their `group` field for rendering.
  const byGroup = new Map<string, CommandItemInfo[]>();
  for (const item of items) {
    const existing = byGroup.get(item.group) ?? [];
    existing.push(item);
    byGroup.set(item.group, existing);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Array.from(byGroup.entries()).map(([groupName, groupItems]) => (
          <CommandGroup key={groupName} heading={groupName}>
            {groupItems.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.keywords ?? ''}`}
                onSelect={() => {
                  setOpen(false);
                  item.run();
                }}
              >
                <span>{item.label}</span>
                {item.shortcut != null ? (
                  <span className="ml-auto text-muted-foreground text-xs">{item.shortcut}</span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * Register a single command palette entry from a feature component. The
 * registry is idempotent on id, so it's safe to call this from a deeply
 * nested component that may re-mount.
 */
export function useCommand(info: CommandItemInfo): void {
  const context = useContext(CommandContext);
  if (context == null) {
    throw new Error('useCommand must be used inside <CommandPaletteProvider>');
  }
  const { register, unregister } = context;

  useEffect(() => {
    register(info);
    return () => unregister(info.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.id]);
}

/**
 * Imperative open/close from buttons that want to trigger the palette.
 */
export function useCommandPalette(): { open: boolean; setOpen: (v: boolean) => void } {
  const context = useContext(CommandContext);
  if (context == null) {
    throw new Error('useCommandPalette must be used inside <CommandPaletteProvider>');
  }
  return { open: context.open, setOpen: context.setOpen };
}

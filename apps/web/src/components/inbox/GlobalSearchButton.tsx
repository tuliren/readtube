'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useCommandPalette } from './CommandPalette';

interface Props {
  /** Hide the keyboard chip on surfaces without a hardware keyboard
   *  (the mobile drawer) — the button still opens the palette. */
  showShortcut?: boolean;
}

/**
 * Discoverability affordance for the ⌘K palette: a search button in
 * the sidebar header that renders the shortcut as a keyboard chip, so
 * users learn the binding while mouse/touch users get a click target
 * for the same global search.
 */
export default function GlobalSearchButton({ showShortcut = true }: Props) {
  const { setOpen } = useCommandPalette();

  // The modifier label depends on the client platform, which the
  // server can't know — resolve it after mount so SSR and the first
  // client render agree (no chip), then the chip appears.
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    if (!showShortcut) {
      return;
    }
    const isMac = /mac/i.test(navigator.platform) || /Mac/.test(navigator.userAgent);
    setShortcut(isMac ? '⌘K' : 'Ctrl K');
  }, [showShortcut]);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label="Search videos and channels"
      title="Search videos and channels"
    >
      <Search className="h-4 w-4" />
      {shortcut != null && (
        <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-sans text-[10px] font-medium leading-none">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

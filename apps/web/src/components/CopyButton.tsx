'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  /** The string to write to the clipboard. Usually an absolute URL. */
  value: string;
  /** Accessible label for the button (and the tooltip `title`). */
  label?: string;
  className?: string;
}

/**
 * Small icon button that copies `value` to the clipboard and flashes
 * a green check for a moment to confirm. Used next to the "Watch on
 * YouTube" / "Share" links in the reader header so the user can grab
 * either URL without opening the target page first.
 */
export default function CopyButton({ value, label = 'Copy link', className }: Props) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending reset on unmount so we don't call setState on an
  // unmounted component if the user navigates away mid-flash.
  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(async () => {
    // Resolve relative paths to absolute URLs at click time so the
    // copied string is useful when pasted elsewhere. Deferred until
    // click so SSR doesn't touch `window`.
    const text = value.startsWith('/') ? `${window.location.origin}${value}` : value;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can reject (insecure context, perm denied). Swallow
      // silently — the button stays in its idle state so the user knows
      // nothing happened.
      return;
    }
    setCopied(true);
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={`inline-flex items-center justify-center rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 ${className ?? ''}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

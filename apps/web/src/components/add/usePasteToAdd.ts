'use client';

import { useEffect } from 'react';

import { detectAddTarget } from '@/lib/add/detectAddTarget';

import type { AddRequest } from './AddDialog';

/**
 * Paste-anywhere shortcut for first-run pages (the welcome panel and
 * the new-user onboarding page): a supported link
 * pasted outside any text field opens the Add dialog prefilled with
 * it. Unrecognized clipboard text is left alone so ordinary pastes
 * elsewhere on the page are never hijacked.
 */
export function usePasteToAdd(enabled: boolean, onAdd: (request: AddRequest) => void) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    function handlePaste(event: ClipboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select') != null)
      ) {
        return;
      }
      const text = event.clipboardData?.getData('text')?.trim() ?? '';
      if (detectAddTarget(text) == null) {
        return;
      }
      event.preventDefault();
      onAdd({ initialUrl: text });
    }
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [enabled, onAdd]);
}

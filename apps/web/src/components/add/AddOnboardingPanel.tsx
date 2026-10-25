'use client';

import { useEffect } from 'react';

import { detectAddTarget } from '@/lib/add/detectAddTarget';

import AddButton from './AddButton';
import AddDemo from './AddDemo';
import type { AddRequest } from './AddDialog';
import AddKindCard from './AddKindCard';
import { ADD_KIND_ORDER } from './addKinds';

interface Props {
  /** Opens the shared Add dialog (`useDashboard().openAdd`). */
  onAdd: (request?: AddRequest) => void;
  /**
   * - `welcome`: first-run inbox. Animated demo, kind cards, and
   *   paste-anywhere so a new user can add something in one move.
   * - `compact`: a page that is empty but not the user's first stop
   *   (an empty library). Just the copy and the Add button.
   */
  variant?: 'welcome' | 'compact';
  title?: string;
  description?: string;
}

const WELCOME_TITLE = 'Add something to read';
const WELCOME_DESCRIPTION =
  'Paste any YouTube or Bilibili link. ReadTube recognizes channels, videos, and playlists, and turns each one into summaries and articles you can read, search, and annotate.';

/**
 * Centered empty-state panel built around the unified Add button.
 * Shown in the main pane whenever a page has nothing in it yet, so
 * the first action is always obvious and always the same.
 */
export default function AddOnboardingPanel({
  onAdd,
  variant = 'welcome',
  title,
  description,
}: Props) {
  const welcome = variant === 'welcome';
  usePasteToAdd(welcome, onAdd);

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6 sm:p-8">
      <div
        className={`flex w-full flex-col items-center text-center ${welcome ? 'max-w-2xl gap-6' : 'max-w-md gap-4'}`}
      >
        <div>
          <h2 className={`font-semibold text-foreground ${welcome ? 'text-2xl' : 'text-lg'}`}>
            {title ?? WELCOME_TITLE}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{description ?? WELCOME_DESCRIPTION}</p>
        </div>

        {welcome && (
          <div className="w-full max-w-md">
            <AddDemo />
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <AddButton
            variant="hero"
            label={welcome ? 'Add a link' : 'Add'}
            onClick={() => onAdd()}
          />
          {welcome && (
            <p className="hidden text-xs text-muted-foreground sm:block">
              Or paste a link anywhere on this page.
            </p>
          )}
        </div>

        {welcome && (
          <div className="grid w-full gap-3 pt-2 sm:grid-cols-3">
            {ADD_KIND_ORDER.map((kind) => (
              <AddKindCard key={kind} kind={kind} onClick={() => onAdd({ kind })} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Paste-anywhere shortcut for the welcome panel: a supported link
 * pasted outside any text field opens the Add dialog prefilled with
 * it. Unrecognized clipboard text is left alone so ordinary pastes
 * elsewhere on the page are never hijacked.
 */
function usePasteToAdd(enabled: boolean, onAdd: (request: AddRequest) => void) {
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

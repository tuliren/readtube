'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  type AddKind,
  type AddTarget,
  describeAddTarget,
  detectAddTarget,
} from '@/lib/add/detectAddTarget';

import AddFormatHints from './AddFormatHints';
import DetectedTargetHint from './DetectedTargetHint';
import { ADD_KINDS } from './addKinds';
import type { AddEntityResult } from './useAddEntity';

export interface AddDialogViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lock the dialog to one kind, for the per-entity entry points
   *  (a folder's "Add channel", a playlist's "Add video"). Omit for
   *  the unified dialog, which detects the kind from the link. */
  kind?: AddKind | null;
  /** Override the locked-mode title, e.g. "Add video to playlist".
   *  Dropped once the user switches to another kind. */
  title?: string;
  /** Prefill the input, e.g. with a link pasted onto the page. */
  initialUrl?: string;
  onSubmit: (kind: AddKind, url: string) => Promise<AddEntityResult>;
}

const UNIFIED_TITLE = 'Add to ReadTube';
const UNIFIED_DESCRIPTION =
  'Paste a YouTube or Bilibili link to a channel, video, or playlist. ReadTube works out which one it is.';

/**
 * The one dialog behind every "add" entry point. Unified mode (no
 * `kind`) classifies the pasted link on each keystroke and submits it
 * as whatever it names. Locked mode keeps the per-entity title and
 * submits as that kind, but still recognizes a link of another kind
 * and offers to add it as that instead of failing on the server.
 */
export default function AddDialogView({
  open,
  onOpenChange,
  kind = null,
  title,
  initialUrl = '',
  onSubmit,
}: AddDialogViewProps) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Which reading of an ambiguous link the user picked. Cleared on
  // every edit so a new link starts from its own most likely reading.
  const [chosenKind, setChosenKind] = useState<AddKind | null>(null);
  // Set when the user accepts "add it as a … instead" in locked mode.
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setError('');
      setBusy(false);
      setChosenKind(null);
      setUnlocked(false);
    }
  }, [open, initialUrl]);

  const detection = useMemo(() => detectAddTarget(url), [url]);
  const candidates = useMemo<AddTarget[]>(
    () => (detection != null ? [detection.primary, ...detection.alternatives] : []),
    [detection]
  );
  const lockedKind = unlocked ? null : kind;
  const trimmed = url.trim();

  let target: AddTarget | null;
  if (lockedKind != null) {
    // Unrecognized input still goes to the locked endpoint: the server
    // is the final judge, and its error names the accepted formats.
    target = candidates.find((c) => c.kind === lockedKind) ?? {
      kind: lockedKind,
      platform: 'youtube',
      url: trimmed,
    };
  } else {
    target = candidates.find((c) => c.kind === chosenKind) ?? detection?.primary ?? null;
  }
  // In locked mode, a link that only reads as some other kind.
  const mismatch =
    lockedKind != null && detection != null && !candidates.some((c) => c.kind === lockedKind)
      ? detection.primary
      : null;

  const canSubmit = !busy && trimmed.length > 0 && target != null && mismatch == null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || target == null) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await onSubmit(target.kind, target.url);
      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  // Block close while a request is in flight so the user can't lose
  // the pending state by clicking the backdrop or hitting Escape.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && busy) {
      return;
    }
    onOpenChange(nextOpen);
  }

  function handleUrlChange(value: string) {
    setUrl(value);
    setError('');
    setChosenKind(null);
  }

  const showFormatHints = trimmed.length === 0 || (detection == null && lockedKind == null);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {lockedKind != null ? (title ?? `Add ${lockedKind}`) : UNIFIED_TITLE}
          </DialogTitle>
          <DialogDescription>
            {lockedKind != null ? ADD_KINDS[lockedKind].blurb : UNIFIED_DESCRIPTION}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            autoFocus
            type="text"
            inputMode="url"
            aria-label="Link to add"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder={
              lockedKind != null
                ? `Paste a ${lockedKind} link`
                : 'Paste a channel, video, or playlist link'
            }
            disabled={busy}
          />

          {mismatch != null ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-amber-700 dark:text-amber-400">
                That looks like a {describeAddTarget(mismatch)} link.
              </span>
              <button
                type="button"
                onClick={() => {
                  setUnlocked(true);
                  setChosenKind(mismatch.kind);
                }}
                className="font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700 dark:text-blue-400"
              >
                Add it as a {mismatch.kind} instead
              </button>
            </div>
          ) : lockedKind == null && trimmed.length > 0 && detection == null ? (
            <p className="text-sm text-amber-700 dark:text-amber-400" aria-live="polite">
              That doesn&apos;t look like a supported link yet. Try one of these:
            </p>
          ) : lockedKind == null && target != null ? (
            <DetectedTargetHint
              candidates={candidates}
              selectedKind={target.kind}
              onSelectKind={setChosenKind}
            />
          ) : null}

          {showFormatHints && <AddFormatHints kind={lockedKind} />}

          {error.length > 0 && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? 'Adding…' : target != null ? `Add ${target.kind}` : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

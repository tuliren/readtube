'use client';

import { useState } from 'react';

import type { AddKind } from '@/lib/add/detectAddTarget';

import AddDialogView from './AddDialogView';
import { useAddEntity } from './useAddEntity';

/** What an entry point asks the Add dialog to open with. */
export interface AddRequest {
  /** Lock to one kind; omit for the unified, auto-detecting dialog. */
  kind?: AddKind;
  /** Channel only: subscribe straight into this folder. */
  folderId?: string | null;
  /** Video only: also add the video to this playlist. */
  playlistId?: string | null;
  /** Prefill the input, e.g. with a link pasted onto the page. */
  initialUrl?: string;
}

interface Props {
  /** Open while non-null. */
  request: AddRequest | null;
  onClose: () => void;
}

/**
 * Wires `AddDialogView` to the real add flow. Owned once by
 * DashboardShell so every entry point (sidebar toolbar, section "+"
 * buttons, empty-state panels) opens the same dialog.
 */
export default function AddDialog({ request, onClose }: Props) {
  const addEntity = useAddEntity();
  // Keep rendering the last request while the dialog animates closed,
  // so the title and copy don't flip to the unified variant mid-fade.
  const [shown, setShown] = useState<AddRequest>(request ?? {});
  if (request != null && request !== shown) {
    setShown(request);
  }

  let title: string | undefined;
  if (shown.kind === 'video') {
    title = shown.playlistId != null ? 'Add video to playlist' : 'Add standalone video';
  }

  return (
    <AddDialogView
      open={request != null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      kind={shown.kind ?? null}
      title={title}
      initialUrl={shown.initialUrl}
      onSubmit={(kind, url) =>
        addEntity(kind, url, { folderId: shown.folderId, playlistId: shown.playlistId })
      }
    />
  );
}

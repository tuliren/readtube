'use client';

import { ArrowLeft, Check, Loader2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import VideoReader from '@/components/reader/VideoReader';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ChannelPreview } from '@/lib/onboarding/types';
import type { VideoData } from '@/lib/types';
import { cn } from '@/lib/utils';

import ChannelPreviewPanel from './ChannelPreviewPanel';

export type PreviewTarget = { kind: 'channel'; id: string } | { kind: 'video'; id: string };

interface Props {
  /** Previews opened so far; the last one shows. Empty means closed. */
  stack: PreviewTarget[];
  onOpenVideo: (id: string) => void;
  onBack: () => void;
  onClose: () => void;
  isSelected: (target: PreviewTarget) => boolean;
  onToggle: (target: PreviewTarget) => void;
}

class PreviewError extends Error {
  constructor(readonly status: number) {
    super(`Preview request failed with ${status}`);
  }
}

/**
 * A preview is a one-off read: no retry loop on a 404 (the row isn't
 * offerable) or a transient failure, and no refetch on focus while the
 * user reads it. The error message is the recovery path.
 */
const PREVIEW_SWR_OPTIONS = { shouldRetryOnError: false, revalidateOnFocus: false } as const;

async function fetchPreview<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new PreviewError(res.status);
  }
  return (await res.json()) as T;
}

/**
 * The onboarding preview: a channel's details and recent videos, or a
 * video in the public reader. Opening a video from a channel pushes it
 * on the stack, and the back button returns to the channel. The header
 * carries the same Follow / Select toggle as the card, so a user can
 * pick without closing the preview.
 */
export default function OnboardingPreviewDialog({
  stack,
  onOpenVideo,
  onBack,
  onClose,
  isSelected,
  onToggle,
}: Props) {
  const current = stack.length > 0 ? stack[stack.length - 1] : null;
  return (
    <Dialog open={current != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        {current != null && (
          <>
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border pl-3 pr-12">
              {stack.length > 1 && (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              )}
              <DialogTitle className="flex-1 truncate px-1 text-sm font-medium text-muted-foreground">
                {current.kind === 'channel' ? 'Channel preview' : 'Video preview'}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {current.kind === 'channel'
                  ? 'The channel and its recent videos.'
                  : 'The summary and article for this video.'}
              </DialogDescription>
              <SelectToggle
                kind={current.kind}
                selected={isSelected(current)}
                onClick={() => onToggle(current)}
              />
            </div>
            {/* Keyed so each preview starts fresh (scroll, tab, expand state). */}
            <div key={`${current.kind}:${current.id}`} className="flex min-h-0 flex-1 flex-col">
              {current.kind === 'channel' ? (
                <ChannelBody id={current.id} onOpenVideo={onOpenVideo} />
              ) : (
                <VideoBody id={current.id} />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SelectToggle({
  kind,
  selected,
  onClick,
}: {
  kind: PreviewTarget['kind'];
  selected: boolean;
  onClick: () => void;
}) {
  const label =
    kind === 'channel' ? (selected ? 'Following' : 'Follow') : selected ? 'Selected' : 'Select';
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        selected
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-muted text-foreground hover:bg-muted/70'
      )}
    >
      {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function ChannelBody({ id, onOpenVideo }: { id: string; onOpenVideo: (id: string) => void }) {
  const { data, error } = useSWR<ChannelPreview>(
    `/api/onboarding/preview/channels/${encodeURIComponent(id)}`,
    fetchPreview,
    PREVIEW_SWR_OPTIONS
  );
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  if (error != null) {
    return <PreviewMessage error={error} />;
  }
  if (data == null) {
    return <PreviewLoading />;
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ChannelPreviewPanel channel={data} onOpenVideo={onOpenVideo} now={now} />
    </div>
  );
}

function VideoBody({ id }: { id: string }) {
  const { data, error } = useSWR<VideoData>(
    `/api/onboarding/preview/videos/${encodeURIComponent(id)}`,
    fetchPreview,
    PREVIEW_SWR_OPTIONS
  );
  if (error != null) {
    return <PreviewMessage error={error} />;
  }
  if (data == null) {
    return <PreviewLoading />;
  }
  // Opens on the Original, the video's own language, matching the
  // card's headline (the public API falls back to English, then the
  // earliest version, when there is no Original).
  return <VideoReader video={data} publicMode embedded preferredLanguage={null} />;
}

function PreviewLoading() {
  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading preview" />
    </div>
  );
}

function PreviewMessage({ error }: { error: unknown }) {
  const notFound = error instanceof PreviewError && error.status === 404;
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {notFound ? 'There is nothing to preview here yet.' : 'Could not load this preview.'}
    </div>
  );
}

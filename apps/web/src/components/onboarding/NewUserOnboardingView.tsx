'use client';

import { useEffect, useMemo, useState } from 'react';

import type { AddRequest } from '@/components/add/AddDialog';
import { usePasteToAdd } from '@/components/add/usePasteToAdd';
import {
  ALL_LANGUAGES,
  DEFAULT_ONBOARDING_LANGUAGE,
  filterByLanguage,
  languageOptions,
} from '@/lib/onboarding/language';
import type { OnboardingSelection, OnboardingSuggestions } from '@/lib/onboarding/types';

import LanguageChips from './LanguageChips';
import OnboardingFooter from './OnboardingFooter';
import OnboardingPreviewDialog, { type PreviewTarget } from './OnboardingPreviewDialog';
import ShowMoreButton from './ShowMoreButton';
import SuggestedChannelCard from './SuggestedChannelCard';
import SuggestedVideoCard from './SuggestedVideoCard';

/** Cards shown per section before "Show more", and added per click. */
const CHANNEL_PAGE = 8;
const VIDEO_PAGE = 6;

export interface NewUserOnboardingViewProps {
  suggestions: OnboardingSuggestions;
  /** Opens the shared Add dialog, for a link of the user's own. */
  onAdd: (request?: AddRequest) => void;
  /** Saves the picks. */
  onSubmit: (selection: OnboardingSelection) => void;
  /** True while the picks are being saved. */
  submitting: boolean;
}

/**
 * The onboarding page itself, free of routing and data hooks so
 * Storybook can render it. One screen, no steps: channels to follow on
 * top, videos to read below, filtered to English by default, and one
 * button that saves every pick at once. Picks survive switching
 * languages, so a user can mix languages before continuing.
 */
export default function NewUserOnboardingView({
  suggestions,
  onAdd,
  onSubmit,
  submitting,
}: NewUserOnboardingViewProps) {
  const options = useMemo(
    () =>
      languageOptions([...suggestions.channels, ...suggestions.videos], suggestions.languageNames),
    [suggestions]
  );
  const [language, setLanguage] = useState(() =>
    options.some((o) => o.code === DEFAULT_ONBOARDING_LANGUAGE)
      ? DEFAULT_ONBOARDING_LANGUAGE
      : ALL_LANGUAGES
  );
  const [channelLimit, setChannelLimit] = useState(CHANNEL_PAGE);
  const [videoLimit, setVideoLimit] = useState(VIDEO_PAGE);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(() => new Set());
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(() => new Set());
  // Previews opened so far: a channel, then maybe one of its videos.
  const [previewStack, setPreviewStack] = useState<PreviewTarget[]>([]);
  // Pasting a link opens the Add dialog, but not over an open preview.
  usePasteToAdd(previewStack.length === 0, onAdd);

  // Captured after mount so the first render matches the server's
  // absolute dates; see `relativeTime`.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  const channels = useMemo(
    () => filterByLanguage(suggestions.channels, language),
    [suggestions.channels, language]
  );
  const videos = useMemo(
    () => filterByLanguage(suggestions.videos, language),
    [suggestions.videos, language]
  );

  function selectLanguage(code: string) {
    setLanguage(code);
    setChannelLimit(CHANNEL_PAGE);
    setVideoLimit(VIDEO_PAGE);
  }

  function isSelected(target: PreviewTarget): boolean {
    return (target.kind === 'channel' ? selectedChannels : selectedVideos).has(target.id);
  }

  function toggleTarget(target: PreviewTarget) {
    if (target.kind === 'channel') {
      setSelectedChannels((prev) => toggle(prev, target.id));
    } else {
      setSelectedVideos((prev) => toggle(prev, target.id));
    }
  }

  function handleContinue() {
    onSubmit({
      channelIds: Array.from(selectedChannels),
      videoIds: Array.from(selectedVideos),
    });
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="@container mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10">
        <header className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
              Welcome to ReadTube
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Follow a few channels and pick some videos to read. New uploads from the channels you
              follow arrive in your inbox as summaries and articles.
            </p>
          </div>
          {options.length > 0 && (
            <LanguageChips options={options} selected={language} onSelect={selectLanguage} />
          )}
        </header>

        {/* Columns follow the main pane's width (a container query), not
            the viewport's: the sidebar takes a variable share of it. */}
        <section aria-labelledby="onboarding-channels" className="flex flex-col gap-3">
          <SectionHeading
            id="onboarding-channels"
            title="Channels to follow"
            description="Recently active channels other readers follow."
          />
          {channels.length === 0 ? (
            <EmptySection message="No channels in this language yet." />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
                {channels.slice(0, channelLimit).map((channel) => (
                  <SuggestedChannelCard
                    key={channel.id}
                    channel={channel}
                    selected={selectedChannels.has(channel.id)}
                    onToggle={(id) => setSelectedChannels((prev) => toggle(prev, id))}
                    onPreview={(id) => setPreviewStack([{ kind: 'channel', id }])}
                  />
                ))}
              </div>
              {channels.length > channelLimit && (
                <ShowMoreButton
                  label="Show more channels"
                  onClick={() => setChannelLimit((n) => n + CHANNEL_PAGE)}
                />
              )}
            </>
          )}
        </section>

        <section aria-labelledby="onboarding-videos" className="flex flex-col gap-3">
          <SectionHeading
            id="onboarding-videos"
            title="Videos to read"
            description="Fresh videos with summaries and articles ready to read."
          />
          {videos.length === 0 ? (
            <EmptySection message="No videos in this language yet." />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
                {videos.slice(0, videoLimit).map((video) => (
                  <SuggestedVideoCard
                    key={video.id}
                    video={video}
                    now={now}
                    selected={selectedVideos.has(video.id)}
                    onToggle={(id) => setSelectedVideos((prev) => toggle(prev, id))}
                    onPreview={(id) => setPreviewStack([{ kind: 'video', id }])}
                  />
                ))}
              </div>
              {videos.length > videoLimit && (
                <ShowMoreButton
                  label="Show more videos"
                  onClick={() => setVideoLimit((n) => n + VIDEO_PAGE)}
                />
              )}
            </>
          )}
        </section>
      </div>

      <OnboardingFooter
        channelCount={selectedChannels.size}
        videoCount={selectedVideos.size}
        submitting={submitting}
        onContinue={handleContinue}
        onAddLink={() => onAdd()}
      />

      <OnboardingPreviewDialog
        stack={previewStack}
        onOpenVideo={(id) => setPreviewStack((prev) => [...prev, { kind: 'video', id }])}
        onBack={() => setPreviewStack((prev) => prev.slice(0, -1))}
        onClose={() => setPreviewStack([])}
        isSelected={isSelected}
        onToggle={toggleTarget}
      />
    </div>
  );
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 id={id} className="text-lg font-semibold text-foreground">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

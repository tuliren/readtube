import type { SubtitleResult, TranscriptSegment } from './types';

export async function fetchSubtitleViaYoutubei(videoId: string): Promise<SubtitleResult> {
  const { Innertube } = await import('youtubei.js');

  const yt = await Innertube.create({ retrieve_player: false });
  const info = await yt.getInfo(videoId);

  const title = info.basic_info.title ?? 'Unknown Title';
  const channel = info.basic_info.author ?? 'Unknown Channel';

  const transcriptData = await info.getTranscript();
  const rawSegments = transcriptData?.transcript?.content?.body?.initial_segments ?? [];

  const segments: TranscriptSegment[] = (rawSegments as unknown[])
    .filter((seg: unknown) => (seg as { type?: string }).type === 'TranscriptSegment')
    .map((seg: unknown) => {
      const s = seg as { start_ms: string; end_ms: string; snippet?: { text?: string } };
      return {
        startMs: Number(s.start_ms),
        endMs: Number(s.end_ms),
        text: s.snippet?.text ?? '',
      };
    })
    .filter((seg) => seg.text.length > 0);

  return {
    videoId,
    title,
    channel,
    language: 'unknown',
    languageName: 'unknown',
    captionType: 'auto-generated',
    segmentCount: segments.length,
    segments,
  };
}

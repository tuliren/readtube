export { fetchSubtitleViaHtmlScraping } from './fetchViaHtmlScraping';
export { fetchSubtitleViaTranscriptApi } from './fetchViaTranscriptApi';
export { fetchSubtitleViaYoutubei } from './fetchViaYoutubei';
export { extractVideoId } from './helpers';
export { SubtitleFetchError } from '@/lib/platforms/types';
export type { TranscriptSegment } from '@/lib/platforms/types';
export type { CaptionEvent, CaptionTrack, SubtitleResult } from './types';

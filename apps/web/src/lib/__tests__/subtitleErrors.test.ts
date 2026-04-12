import { isPermanentTranscriptStatus } from '../subtitles/fetchViaTranscriptApi';
import { SubtitleFetchError } from '../subtitles/types';

describe('isPermanentTranscriptStatus', () => {
  it.each<{ status: number; expected: boolean; desc: string }>([
    { status: 404, expected: true, desc: '404 means no captions for this video' },
    { status: 410, expected: true, desc: '410 means upstream removed the entry' },
    { status: 422, expected: true, desc: '422 is upstream signal for "no captions track"' },
    { status: 429, expected: false, desc: '429 rate limit is transient' },
    { status: 500, expected: false, desc: '500 server error is transient' },
    { status: 502, expected: false, desc: '502 bad gateway is transient' },
    { status: 503, expected: false, desc: '503 unavailable is transient' },
    { status: 504, expected: false, desc: '504 gateway timeout is transient' },
    { status: 401, expected: false, desc: '401 auth bug is transient (operator-fixable)' },
    { status: 403, expected: false, desc: '403 quota is transient (operator-fixable)' },
    { status: 400, expected: false, desc: '400 is conservatively transient' },
    { status: 200, expected: false, desc: '200 should never be classified permanent' },
  ])('$desc ($status)', ({ status, expected }) => {
    expect(isPermanentTranscriptStatus(status)).toBe(expected);
  });
});

describe('SubtitleFetchError', () => {
  it('carries the transient flag and status through to the caller', () => {
    const err = new SubtitleFetchError('upstream 429', { transient: true, status: 429 });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SubtitleFetchError);
    expect(err.message).toBe('upstream 429');
    expect(err.transient).toBe(true);
    expect(err.status).toBe(429);
    expect(err.name).toBe('SubtitleFetchError');
  });

  it('allows status to be omitted for network errors', () => {
    const err = new SubtitleFetchError('network ECONNRESET', { transient: true });
    expect(err.transient).toBe(true);
    expect(err.status).toBeUndefined();
  });
});

import { prepareTranscript, transcriptOutcomeFromResponse } from '../prepareTranscript';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('transcriptOutcomeFromResponse', () => {
  it.each([
    ['410', jsonResponse({ code: 'unavailable' }, 410), { kind: 'no-captions' }],
    [
      '503 with a server message',
      jsonResponse({ error: 'Upstream is down.' }, 503),
      { kind: 'error', message: 'Upstream is down.' },
    ],
    [
      '503 without a body',
      new Response(null, { status: 503 }),
      { kind: 'error', message: 'Could not fetch the transcript right now. Please try again.' },
    ],
  ])('maps %s', async (_label, res, expected) => {
    expect(await transcriptOutcomeFromResponse(res)).toEqual(expected);
  });

  it('maps 425 to a scheduled outcome with a toast message', async () => {
    const outcome = await transcriptOutcomeFromResponse(
      jsonResponse({ code: 'scheduled', scheduledStartTime: null }, 425)
    );
    expect(outcome).toEqual({
      kind: 'scheduled',
      message: 'This video has not aired yet. Try again once it has premiered.',
    });
  });

  it.each([400, 403, 404, 500])('leaves %i to the caller', async (status) => {
    expect(await transcriptOutcomeFromResponse(jsonResponse({}, status))).toBeNull();
  });
});

describe('prepareTranscript', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ['200', () => Promise.resolve(jsonResponse({ segments: [] }, 200)), { kind: 'ready' }],
    ['410', () => Promise.resolve(jsonResponse({}, 410)), { kind: 'no-captions' }],
    [
      '404 with a message',
      () => Promise.resolve(jsonResponse({ error: 'Video not found' }, 404)),
      { kind: 'error', message: 'Video not found' },
    ],
    [
      'a network failure',
      () => Promise.reject(new Error('offline')),
      { kind: 'error', message: 'Could not fetch the transcript right now. Please try again.' },
    ],
  ])('maps %s', async (_label, impl, expected) => {
    const fetchMock = jest.fn(impl);
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await prepareTranscript('video-1')).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledWith('/api/videos/video-1/transcript', { method: 'POST' });
  });
});

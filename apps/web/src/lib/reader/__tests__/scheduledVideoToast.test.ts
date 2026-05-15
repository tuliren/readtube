import { buildScheduledMessage, parseScheduledResponse } from '../scheduledVideoToast';

describe('buildScheduledMessage', () => {
  it('includes the localized start time when given a parseable ISO date', () => {
    const message = buildScheduledMessage('2026-05-15T10:45:00+00:00');
    // Don't assert the exact locale formatting (varies by Node ICU);
    // just confirm both halves of the sentence are present.
    expect(message).toMatch(/scheduled to air on/);
    expect(message).toMatch(/Try again once it has premiered/);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['unparseable', 'not-a-date'],
  ])('falls back to the generic message for %s', (_label, input) => {
    const message = buildScheduledMessage(input);
    expect(message).toBe('This video has not aired yet. Try again once it has premiered.');
  });
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('parseScheduledResponse', () => {
  it('parses a 425 body with the scheduled code', async () => {
    const res = jsonResponse(
      { code: 'scheduled', scheduledStartTime: '2026-05-15T10:45:00+00:00' },
      { status: 425 }
    );
    const parsed = await parseScheduledResponse(res);
    expect(parsed).toEqual({
      code: 'scheduled',
      scheduledStartTime: '2026-05-15T10:45:00+00:00',
    });
  });

  it('returns null for a body without the scheduled discriminator', async () => {
    const res = jsonResponse({ code: 'unavailable' });
    const parsed = await parseScheduledResponse(res);
    expect(parsed).toBeNull();
  });

  it('returns null when the body is not JSON', async () => {
    const res = new Response('plain text body', { status: 425 });
    const parsed = await parseScheduledResponse(res);
    expect(parsed).toBeNull();
  });
});

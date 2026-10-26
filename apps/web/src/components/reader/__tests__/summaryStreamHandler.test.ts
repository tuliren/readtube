import {
  type SummaryField,
  createSummaryStreamHandler,
  summaryStreamFailure,
} from '../summaryStreamHandler';

function setup() {
  const fieldContent: Array<[SummaryField, string]> = [];
  const latex: Array<[string, boolean]> = [];
  const onGenerating = jest.fn();
  const handler = createSummaryStreamHandler({
    onFieldContent: (field, content) => fieldContent.push([field, content]),
    onHasLatex: (field, hasLatex) => latex.push([field, hasLatex]),
    onGenerating,
  });
  return { handler, fieldContent, latex, onGenerating };
}

describe('createSummaryStreamHandler', () => {
  it('accumulates deltas per field and reports the running value', () => {
    const { handler, fieldContent } = setup();
    handler.onEvent({ field: 'headline', delta: 'Hello' });
    handler.onEvent({ field: 'headline', delta: ' world' });
    handler.onEvent({ field: 'short', delta: 'Short.' });
    expect(fieldContent).toEqual([
      ['headline', 'Hello'],
      ['headline', 'Hello world'],
      ['short', 'Short.'],
    ]);
    expect(handler.getState().accumulated).toEqual({
      headline: 'Hello world',
      short: 'Short.',
      full: '',
    });
  });

  it('signals the generating phase without touching content', () => {
    const { handler, fieldContent, onGenerating } = setup();
    handler.onEvent({ phase: 'generating' });
    expect(onGenerating).toHaveBeenCalledTimes(1);
    expect(fieldContent).toEqual([]);
  });

  it('forwards hasLatex only for short and full', () => {
    const { handler, latex } = setup();
    handler.onEvent({ field: 'headline', hasLatex: true });
    handler.onEvent({ field: 'full', hasLatex: true });
    expect(latex).toEqual([['full', true]]);
  });

  it.each([
    ['done', { type: 'done' }, { sawDone: true, error: null }],
    ['top-level error', { error: 'boom' }, { sawDone: false, error: 'boom' }],
    ['field error', { field: 'full', error: 'bad' }, { sawDone: false, error: 'bad' }],
  ])('tracks a %s terminal event', (_label, event, expected) => {
    const { handler } = setup();
    handler.onEvent(event);
    expect(handler.getState()).toMatchObject(expected);
  });

  it.each([null, 'text', 42])('ignores non-object event %p', (event) => {
    const { handler, fieldContent, onGenerating } = setup();
    handler.onEvent(event);
    expect(fieldContent).toEqual([]);
    expect(onGenerating).not.toHaveBeenCalled();
  });
});

describe('summaryStreamFailure', () => {
  const content = { headline: 'H', short: '', full: '' };
  const empty = { headline: '', short: '', full: '' };

  it.each([
    ['clean finish', { accumulated: content, sawDone: true, error: null }, null],
    ['stream error', { accumulated: content, sawDone: true, error: 'boom' }, 'boom'],
    [
      'missing terminator',
      { accumulated: content, sawDone: false, error: null },
      'Generation ended unexpectedly. Please refresh in a moment, or try again.',
    ],
    [
      'no content',
      { accumulated: empty, sawDone: true, error: null },
      'No content was generated. Please try again.',
    ],
  ])('reports %s', (_label, state, expected) => {
    expect(summaryStreamFailure(state, ['headline', 'short', 'full'])).toBe(expected);
  });

  it('only counts content in the requested fields', () => {
    const state = { accumulated: content, sawDone: true, error: null };
    expect(summaryStreamFailure(state, ['full'])).toBe(
      'No content was generated. Please try again.'
    );
  });
});

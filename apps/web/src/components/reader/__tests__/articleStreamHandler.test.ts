import { createArticleStreamHandler } from '../articleStreamHandler';

function setup() {
  const setters = {
    setContent: jest.fn(),
    setHasLatex: jest.fn(),
    setSectionsTotal: jest.fn(),
    setSectionsReady: jest.fn(),
    setReducing: jest.fn(),
    setArticleTitle: jest.fn(),
    onSection: jest.fn(),
    setConsolidatedHeadings: jest.fn(),
    onPhase: jest.fn(),
  };
  return { setters, handler: createArticleStreamHandler(setters) };
}

describe('createArticleStreamHandler', () => {
  it.each(['generating', 'embedding'] as const)('forwards the %s phase', (phase) => {
    const { setters, handler } = setup();
    handler.onEvent({ phase });
    expect(setters.onPhase).toHaveBeenCalledWith(phase);
    expect(setters.setContent).not.toHaveBeenCalled();
  });

  it.each([{ phase: 'planning', sectionsTotal: 3 }, { phase: 'reducing' }, { delta: 'Hi' }])(
    'does not report %o as a progress phase',
    (event) => {
      const { setters, handler } = setup();
      handler.onEvent(event);
      expect(setters.onPhase).not.toHaveBeenCalled();
    }
  );

  it('appends single-pass deltas after the generating phase', () => {
    const { setters, handler } = setup();
    handler.onEvent({ phase: 'generating' });
    handler.onEvent({ delta: 'Hello' });
    handler.onEvent({ delta: ' world' });
    handler.onEvent({ type: 'done' });
    expect(setters.setContent).toHaveBeenLastCalledWith('Hello world');
    expect(handler.getState()).toEqual({ content: 'Hello world', sawDone: true, error: null });
  });
});

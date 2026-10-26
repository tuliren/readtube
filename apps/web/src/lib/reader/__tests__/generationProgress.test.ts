import {
  type GenerationStage,
  PROGRESS_CAP,
  formatElapsed,
  stageCopy,
  stageProgress,
} from '../generationProgress';

const EASED_STAGES: GenerationStage[] = [
  { kind: 'transcript' },
  { kind: 'transcribing' },
  { kind: 'starting' },
  { kind: 'queued' },
  { kind: 'resuming' },
  { kind: 'drafting' },
  { kind: 'embedding' },
  { kind: 'reducing' },
];

describe('stageProgress', () => {
  it.each(EASED_STAGES.map((stage) => [stage.kind, stage]))(
    '%s starts at its base and eases upward without reaching the cap',
    (_kind, stage) => {
      expect(stageProgress(20, stage, 0)).toBe(20);
      const early = stageProgress(20, stage, 1_000);
      const late = stageProgress(20, stage, 10 * 60_000);
      expect(early).toBeGreaterThan(20);
      expect(late).toBeGreaterThan(early);
      expect(late).toBeLessThan(PROGRESS_CAP);
    }
  );

  it.each([
    ['negative base', -10, 0, 0],
    ['base above cap', 120, 0, PROGRESS_CAP],
    ['negative elapsed', 30, -5_000, 30],
  ])('clamps %s', (_label, base, elapsedMs, expected) => {
    expect(stageProgress(base, { kind: 'drafting' }, elapsedMs)).toBe(expected);
  });

  it.each([
    [0, 10, 40],
    [5, 10, 40 + (PROGRESS_CAP - 40) * 0.85 * 0.5],
    [10, 10, 40 + (PROGRESS_CAP - 40) * 0.85],
    [3, 0, 40],
  ])('writing with %i of %i sections ready tracks the real fraction', (ready, total, expected) => {
    const stage: GenerationStage = { kind: 'writing', sectionsReady: ready, sectionsTotal: total };
    expect(stageProgress(40, stage, 999_999)).toBeCloseTo(expected);
  });
});

describe('stageCopy', () => {
  it.each([
    [{ kind: 'starting' }, 'summary', 'Starting the summary'],
    [{ kind: 'resuming' }, 'article', 'Reconnecting to the article in progress'],
    [{ kind: 'writing', sectionsReady: 0, sectionsTotal: 1 }, 'article', 'Writing 1 section'],
    [{ kind: 'writing', sectionsReady: 2, sectionsTotal: 7 }, 'article', 'Writing 7 sections'],
  ] as const)('titles %o for the %s', (stage, subject, title) => {
    expect(stageCopy(stage, subject).title).toBe(title);
  });

  it('reports section progress as the writing detail', () => {
    expect(
      stageCopy({ kind: 'writing', sectionsReady: 2, sectionsTotal: 7 }, 'article').detail
    ).toBe('2 of 7 ready');
  });

  it.each(EASED_STAGES.map((stage) => [stage.kind, stage]))(
    '%s copy has no em dash',
    (_kind, stage) => {
      const copy = stageCopy(stage, 'summary');
      expect(`${copy.title} ${copy.detail ?? ''}`).not.toContain('—');
    }
  );
});

describe('formatElapsed', () => {
  it.each([
    [0, '0s'],
    [999, '0s'],
    [8_400, '8s'],
    [60_000, '1m 00s'],
    [65_000, '1m 05s'],
    [754_000, '12m 34s'],
    [-1_000, '0s'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });
});

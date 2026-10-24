import {
  type ComparisonReport,
  type ModelRun,
  buildStatsRows,
  escapeHtml,
  renderComparisonHtml,
} from '@/lib/ai/modelComparison';

const okRun: ModelRun = {
  model: 'provider/model-a',
  ok: true,
  summary: {
    headline: 'Headline A',
    full: { content: 'Full **summary** A', hasLatex: false },
    short: { content: 'Short A', hasLatex: false },
  },
  stats: {
    latencyMs: 12_345,
    inputTokens: 10_000,
    outputTokens: 1_500,
    reasoningTokens: null,
    costUsd: 0.0012345,
  },
};

const failedRun: ModelRun = {
  model: 'provider/model-b',
  ok: false,
  error: 'Model not found',
  latencyMs: 400,
};

function buildReport(runs: readonly [ModelRun, ModelRun]): ComparisonReport {
  return {
    videoTitle: 'Video <title>',
    channelName: 'Channel',
    sourceId: 'VIDEO_ID',
    language: null,
    transcriptChars: 54_321,
    generatedAt: new Date('2026-01-01T00:00:00Z'),
    runs,
  };
}

describe('escapeHtml', () => {
  it.each([
    ['<script>', '&lt;script&gt;'],
    ['a & b', 'a &amp; b'],
    [`"quoted" 'single'`, '&quot;quoted&quot; &#39;single&#39;'],
    ['plain', 'plain'],
  ])('escapes %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });
});

describe('buildStatsRows', () => {
  it.each([
    ['Latency', ['12.3s', '0.4s']],
    ['Input tokens', ['10,000', 'failed']],
    ['Reasoning tokens', ['–', 'failed']],
    ['Cost', ['$0.00123', 'failed']],
    ['Short summary chars', ['7', 'failed']],
    ['Full summary chars', ['18', 'failed']],
  ])('formats %s per model', (metric, values) => {
    const row = buildStatsRows([okRun, failedRun]).find((r) => r.metric === metric);
    expect(row?.values).toEqual(values);
  });
});

describe('renderComparisonHtml', () => {
  it('escapes model output so it cannot inject markup', () => {
    const injected: ModelRun = {
      ...okRun,
      summary: { ...okRun.summary, headline: '</div><script>alert(1)</script>' },
    } as ModelRun;
    const html = renderComparisonHtml(buildReport([injected, okRun]));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;/div&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Video &lt;title&gt;');
  });

  it('shows the error for a failed run and content for a successful one', () => {
    const html = renderComparisonHtml(buildReport([okRun, failedRun]));
    expect(html).toContain('Full **summary** A');
    expect(html).toContain('<div class="error">Model not found</div>');
    expect(html).toContain('<title>provider/model-a vs provider/model-b</title>');
  });
});

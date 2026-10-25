import type { SummaryObject } from '@/lib/workflows/summary/schema';

/**
 * Report helpers for `scripts/compareModels.ts`, which generates the
 * same summary with two AI Gateway models and renders them side by
 * side. Kept pure (no I/O) so the rendering is unit-testable.
 */

export interface ModelRunStats {
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  /** USD cost reported by the AI Gateway, when available. */
  costUsd: number | null;
}

export type ModelRun =
  | { model: string; ok: true; summary: SummaryObject; stats: ModelRunStats }
  | { model: string; ok: false; error: string; latencyMs: number };

export interface ComparisonReport {
  videoTitle: string;
  channelName: string;
  sourceId: string;
  language: string | null;
  transcriptChars: number;
  generatedAt: Date;
  runs: readonly [ModelRun, ModelRun];
}

const SECTIONS = [
  { key: 'headline', label: 'Headline' },
  { key: 'short', label: 'Short summary' },
  { key: 'full', label: 'Full summary' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

export function sectionContent(summary: SummaryObject, key: SectionKey): string {
  if (key === 'headline') {
    return summary.headline ?? '';
  }
  return summary[key]?.content ?? '';
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value: number | null): string {
  return value == null ? '–' : value.toLocaleString('en-US');
}

function formatCost(value: number | null): string {
  return value == null ? '–' : `$${value.toFixed(5)}`;
}

/** One row per metric, one column per model. Shared by the terminal
 *  table and the HTML report. */
export function buildStatsRows(runs: readonly ModelRun[]): { metric: string; values: string[] }[] {
  const pick = (fn: (stats: ModelRunStats, summary: SummaryObject) => string) =>
    runs.map((run) => (run.ok ? fn(run.stats, run.summary) : 'failed'));
  return [
    {
      metric: 'Latency',
      values: runs.map(
        (run) => `${((run.ok ? run.stats.latencyMs : run.latencyMs) / 1000).toFixed(1)}s`
      ),
    },
    { metric: 'Input tokens', values: pick((s) => formatNumber(s.inputTokens)) },
    { metric: 'Output tokens', values: pick((s) => formatNumber(s.outputTokens)) },
    { metric: 'Reasoning tokens', values: pick((s) => formatNumber(s.reasoningTokens)) },
    { metric: 'Cost', values: pick((s) => formatCost(s.costUsd)) },
    ...SECTIONS.filter((section) => section.key !== 'headline').map((section) => ({
      metric: `${section.label} chars`,
      values: pick((_, summary) => formatNumber(sectionContent(summary, section.key).length)),
    })),
  ];
}

/**
 * Self-contained HTML page: a stats table followed by one two-column
 * row per summary section. Model output is HTML-escaped into the page,
 * then rendered as markdown client-side with `marked`; if the CDN
 * script fails to load, the raw markdown shows.
 */
export function renderComparisonHtml(report: ComparisonReport): string {
  const [a, b] = report.runs;
  const header = `<tr><th></th><th>${escapeHtml(a.model)}</th><th>${escapeHtml(b.model)}</th></tr>`;
  const statsRows = buildStatsRows(report.runs)
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.metric)}</td>${row.values
          .map((value) => `<td>${escapeHtml(value)}</td>`)
          .join('')}</tr>`
    )
    .join('\n');

  const cell = (run: ModelRun, key: SectionKey): string => {
    if (!run.ok) {
      return `<div class="error">${escapeHtml(run.error)}</div>`;
    }
    return `<div class="md">${escapeHtml(sectionContent(run.summary, key))}</div>`;
  };
  const sections = SECTIONS.map(
    (section) => `<h2>${section.label}</h2>
<div class="grid">
  <div class="col"><div class="model">${escapeHtml(a.model)}</div>${cell(a, section.key)}</div>
  <div class="col"><div class="model">${escapeHtml(b.model)}</div>${cell(b, section.key)}</div>
</div>`
  ).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${a.model} vs ${b.model}`)}</title>
<style>
  :root { color-scheme: light dark; --border: #8884; --muted: #888; }
  body { font: 15px/1.6 system-ui, sans-serif; margin: 0 auto; padding: 24px 16px; max-width: 1400px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 32px 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  .meta { color: var(--muted); font-size: 13px; }
  table { border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid var(--border); padding: 4px 12px; text-align: left; }
  td:not(:first-child) { font-variant-numeric: tabular-nums; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
  .col { min-width: 0; }
  .model { font: 600 12px/1 ui-monospace, monospace; color: var(--muted); margin-bottom: 8px; }
  .md { white-space: pre-wrap; overflow-wrap: anywhere; }
  .md.rendered { white-space: normal; }
  .error { color: #d33; white-space: pre-wrap; }
</style>
</head>
<body>
<h1>${escapeHtml(report.videoTitle)}</h1>
<div class="meta">${escapeHtml(report.channelName)} · ${escapeHtml(report.sourceId)} · language ${escapeHtml(
    report.language ?? 'original'
  )} · transcript ${formatNumber(report.transcriptChars)} chars · ${escapeHtml(
    report.generatedAt.toISOString()
  )}</div>
<table>
${header}
${statsRows}
</table>
${sections}
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.12/marked.min.js"></script>
<script>
  if (window.marked != null) {
    for (const el of document.querySelectorAll('.md')) {
      el.innerHTML = window.marked.parse(el.textContent);
      el.classList.add('rendered');
    }
  }
</script>
</body>
</html>
`;
}

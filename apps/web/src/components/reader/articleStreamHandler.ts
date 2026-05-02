/**
 * Event handler for the NDJSON wire protocol that carries article
 * generation. Handles BOTH:
 *
 *   - single-pass / cache-replay events: `{ delta }`, `{ hasLatex }`,
 *     `{ type: 'done' }`, `{ error }`
 *
 *   - map-reduce events: `{ phase: 'planning', sectionsTotal }`,
 *     `{ section, topic, body, hasLatex }`, `{ phase: 'reducing' }`,
 *     `{ reduce: { articleTitle, headings } }`, then a single final
 *     `{ delta: fullAssembledMarkdown }` + `{ hasLatex }` so any
 *     unaware client still ends up with the canonical content
 *     buffered.
 *
 * Mode is auto-detected: a `phase: 'planning'` event before any
 * `delta` switches into map-reduce; otherwise the stream is treated
 * as single-pass (deltas append). In map-reduce mode the final
 * `delta` event REPLACES content rather than appending — the
 * map-reduce strategy emits the entire assembled markdown as a
 * single delta, and we already have a partially-rendered version
 * built from per-section events.
 */
export type StreamMode = 'unknown' | 'single-pass' | 'map-reduce';

export interface SectionState {
  topic: string;
  body: string;
  hasLatex: boolean;
}

export interface ArticleStreamSetters {
  setContent: (s: string) => void;
  setHasLatex: (b: boolean) => void;
  setSectionsTotal: (n: number | null) => void;
  setSectionsReady: (n: number) => void;
  setReducing: (b: boolean) => void;
  setArticleTitle: (s: string | null) => void;
  /**
   * Per-section completion event from the map-reduce strategy. Lets the
   * UI render section bodies as they arrive (with skeletons in gaps)
   * rather than waiting for the whole article to land.
   */
  onSection: (index: number, state: SectionState) => void;
  /**
   * The reduce pass's consolidated heading list (one entry per section).
   * Empty string entries mean "render this section without its own heading".
   */
  setConsolidatedHeadings: (headings: string[] | null) => void;
}

export interface ArticleStreamHandler {
  onEvent: (event: unknown) => void;
  getState: () => { content: string; sawDone: boolean; error: string | null };
}

export function createArticleStreamHandler(setters: ArticleStreamSetters): ArticleStreamHandler {
  let mode: StreamMode = 'unknown';
  let accumulated = '';
  let sectionsTotal: number | null = null;
  const sections = new Map<number, SectionState>();
  let consolidatedHeadings: string[] | null = null;
  let sawDone = false;
  let error: string | null = null;
  let lastContent = '';

  const rebuildMapReduceContent = (): string => {
    if (sectionsTotal == null) {
      return '';
    }
    let out = '';
    for (let i = 0; i < sectionsTotal; i++) {
      const sec = sections.get(i);
      if (sec == null) {
        continue;
      }
      const heading =
        consolidatedHeadings != null && i < consolidatedHeadings.length
          ? consolidatedHeadings[i]
          : sec.topic;
      if (heading != null && heading.trim().length > 0) {
        out += `## ${heading}\n\n`;
      }
      out += sec.body.trim() + '\n\n';
    }
    return out.trim();
  };

  const refresh = () => {
    if (mode !== 'map-reduce') {
      return;
    }
    const next = rebuildMapReduceContent();
    lastContent = next;
    setters.setContent(next);
  };

  const onEvent: ArticleStreamHandler['onEvent'] = (raw) => {
    if (typeof raw !== 'object' || raw === null) {
      return;
    }
    const e = raw as Record<string, unknown>;

    // Phase markers — map-reduce only.
    if (e.phase === 'planning' && typeof e.sectionsTotal === 'number') {
      mode = 'map-reduce';
      sectionsTotal = e.sectionsTotal;
      setters.setSectionsTotal(e.sectionsTotal);
      setters.setSectionsReady(0);
      refresh();
    }
    if (e.phase === 'reducing') {
      setters.setReducing(true);
    }

    // Per-section completion (map-reduce).
    if (
      typeof e.section === 'number' &&
      typeof e.topic === 'string' &&
      typeof e.body === 'string'
    ) {
      const sectionState: SectionState = {
        topic: e.topic,
        body: e.body,
        hasLatex: e.hasLatex === true,
      };
      sections.set(e.section, sectionState);
      setters.setSectionsReady(sections.size);
      setters.onSection(e.section, sectionState);
      refresh();
    }

    // Reduce-pass output (map-reduce).
    const reduce = e.reduce;
    if (reduce != null && typeof reduce === 'object') {
      const r = reduce as Record<string, unknown>;
      if (Array.isArray(r.headings)) {
        consolidatedHeadings = r.headings.filter((h): h is string => typeof h === 'string');
        setters.setConsolidatedHeadings(consolidatedHeadings);
        refresh();
      }
      if (typeof r.articleTitle === 'string') {
        setters.setArticleTitle(r.articleTitle);
      }
    }

    // Body delta. Single-pass appends; map-reduce treats the (single)
    // delta as canonical assembled content and replaces.
    if (typeof e.delta === 'string') {
      if (mode === 'unknown') {
        mode = 'single-pass';
      }
      if (mode === 'single-pass') {
        accumulated += e.delta;
        lastContent = accumulated;
        setters.setContent(accumulated);
      } else {
        lastContent = e.delta;
        setters.setContent(e.delta);
      }
    }

    // Top-level hasLatex (vs per-section).
    if (typeof e.hasLatex === 'boolean' && e.section == null) {
      setters.setHasLatex(e.hasLatex);
    }

    if (typeof e.error === 'string') {
      error = e.error;
    }
    if (e.type === 'done') {
      sawDone = true;
    }
  };

  return {
    onEvent,
    getState: () => ({ content: lastContent, sawDone, error }),
  };
}

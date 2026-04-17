/**
 * Shared parser for AI-generated markdown documents that may carry a
 * small YAML-style frontmatter block at the top. The frontmatter
 * format is intentionally tiny — it's written by us, not by users,
 * so we don't need a full YAML parser (no nesting, no multi-line
 * values, no arrays). Just `key: value` lines.
 *
 * All reads of stored AI content should go through this function.
 * If the schema evolves, handle the new version here.
 */

export type FrontmatterVersion = 'v1';

export interface MarkdownProperties {
  version?: FrontmatterVersion;
  hasLatex?: boolean;
  [key: string]: unknown;
}

export interface MarkdownDocument {
  content: string;
  properties: MarkdownProperties;
  /**
   * True when a frontmatter opener (`---\n`) was observed but the
   * closing `---` hasn't arrived yet. Streaming consumers should
   * defer rendering while this is true, so the user doesn't briefly
   * see raw `---\nversion: v1\n…` flash on screen while the model
   * is still emitting the header.
   */
  frontmatterPending: boolean;
}

export const CURRENT_FRONTMATTER_VERSION: FrontmatterVersion = 'v1';

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---(?:\n|$)/;

function coerceValue(key: string, raw: string): unknown {
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  // `version` is always a string tag — never coerce.
  if (key === 'version') {
    return raw;
  }
  const asNumber = Number(raw);
  if (raw.length > 0 && !Number.isNaN(asNumber)) {
    return asNumber;
  }
  return raw;
}

export function parseMarkdownDocument(raw: string): MarkdownDocument {
  const match = raw.match(FRONTMATTER_REGEX);
  if (match == null) {
    // Either no frontmatter at all, or an opener that hasn't been
    // closed yet — distinguish so streaming callers know whether to
    // wait before rendering.
    const frontmatterPending = raw.startsWith('---\n');
    return { content: raw, properties: {}, frontmatterPending };
  }
  const [fullMatch, body] = match;
  const properties: MarkdownProperties = {};
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const sep = trimmed.indexOf(':');
    if (sep < 0) {
      continue;
    }
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim();
    if (key.length === 0) {
      continue;
    }
    properties[key] = coerceValue(key, value);
  }
  // Strip a single blank line that commonly follows the closing fence.
  let content = raw.slice(fullMatch.length);
  if (content.startsWith('\n')) {
    content = content.slice(1);
  }
  return { content, properties, frontmatterPending: false };
}

/**
 * Inverse of parseMarkdownDocument. Used by generation routes when
 * persisting fresh content. Properties are serialized in a stable
 * order (version first, then hasLatex, then others sorted) so diffs
 * of the stored rows are readable.
 */
export function serializeMarkdownDocument(content: string, properties: MarkdownProperties): string {
  const orderedKeys: string[] = [];
  if (properties.version != null) {
    orderedKeys.push('version');
  }
  if (properties.hasLatex != null) {
    orderedKeys.push('hasLatex');
  }
  for (const key of Object.keys(properties).sort()) {
    if (key === 'version' || key === 'hasLatex') {
      continue;
    }
    orderedKeys.push(key);
  }
  if (orderedKeys.length === 0) {
    return content;
  }
  const lines = orderedKeys.map((key) => `${key}: ${String(properties[key])}`);
  return `---\n${lines.join('\n')}\n---\n\n${content}`;
}

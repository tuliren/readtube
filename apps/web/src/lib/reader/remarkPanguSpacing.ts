import type { Nodes, Parent, Root, Text } from 'mdast';
import { pangu } from 'pangu/shared';

/**
 * Remark plugin that inserts pangu spacing (盘古之白) between CJK
 * characters and half-width letters, digits, and symbols, e.g.
 * `使用OpenAI的模型` → `使用 OpenAI 的模型`. pangu's CJK range covers
 * Chinese and Japanese only; Korean, which already separates words
 * with spaces, and non-CJK text pass through unchanged.
 *
 * Runs on the mdast tree rather than the raw markdown string so code
 * blocks, URLs, and math sources are never touched. Each text node is
 * spaced on its own; the boundaries between neighbouring inline nodes
 * (`中文**English**`, `用`npm`安装`, a link next to CJK prose) are
 * handled separately, since no single text node sees both sides.
 */
export default function remarkPanguSpacing() {
  return (tree: Root) => {
    spaceChildren(tree);
  };
}

/** Phrasing containers whose text flows into their neighbours. */
const INLINE_CONTAINERS = new Set(['emphasis', 'strong', 'delete', 'link', 'linkReference']);
/** Inline leaves with visible text that must not be rewritten. */
const READ_ONLY_LEAVES = new Set(['inlineCode', 'inlineMath']);

interface Leaf {
  node: { type: string; value: string };
  /** Nesting depth inside the current run of inline content. */
  depth: number;
}

interface Run {
  leaves: Leaf[];
}

function spaceChildren(parent: Parent): void {
  const run: Run = { leaves: [] };
  for (const child of parent.children) {
    collect(child, 0, run);
  }
  endRun(run);
}

function endRun(run: Run): void {
  spaceBoundaries(run.leaves);
  run.leaves = [];
}

/**
 * Walk one node, appending its text leaves to the current run. Anything
 * that breaks the inline flow (a block, a hard break, raw HTML, an
 * image) ends the run so no space is added across it.
 */
function collect(node: Nodes, depth: number, run: Run): void {
  if (node.type === 'text') {
    node.value = pangu.spaceText(node.value);
    run.leaves.push({ node, depth });
    return;
  }
  if (READ_ONLY_LEAVES.has(node.type) && 'value' in node) {
    run.leaves.push({ node, depth });
    return;
  }
  if (INLINE_CONTAINERS.has(node.type) && 'children' in node) {
    for (const child of node.children) {
      collect(child, depth + 1, run);
    }
    return;
  }
  endRun(run);
  // Code blocks and raw HTML have a `value` but no children, so they
  // are skipped here along with every other leaf.
  if ('children' in node) {
    spaceChildren(node);
  }
}

/** Characters on each side of a boundary given to pangu as context. */
const BOUNDARY_CONTEXT = 3;

function spaceBoundaries(run: Leaf[]): void {
  for (let i = 0; i + 1 < run.length; i++) {
    const left = run[i];
    const right = run[i + 1];
    if (!needsSpace(left.node.value, right.node.value)) {
      continue;
    }
    // Put the space outside formatting and links where possible, so
    // `中文**English**` becomes `中文 **English**` rather than putting
    // the space inside the bold span. Ties go to the left node.
    const target = pickTarget(left, right);
    if (target === left) {
      (left.node as Text).value += ' ';
    } else if (target === right) {
      (right.node as Text).value = ` ${right.node.value}`;
    }
  }
}

function needsSpace(left: string, right: string): boolean {
  if (left.length === 0 || right.length === 0 || /\s$/.test(left) || /^\s/.test(right)) {
    return false;
  }
  const tail = left.slice(-BOUNDARY_CONTEXT);
  const head = right.slice(0, BOUNDARY_CONTEXT);
  return pangu.spaceText(tail + head) === `${pangu.spaceText(tail)} ${pangu.spaceText(head)}`;
}

function pickTarget(left: Leaf, right: Leaf): Leaf | null {
  const candidates = [left, right].filter((leaf) => leaf.node.type === 'text');
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((best, leaf) => (leaf.depth < best.depth ? leaf : best));
}

/** Pangu spacing for plain-text fields rendered outside markdown. */
export function panguSpaceText(text: string): string {
  return pangu.spaceText(text);
}

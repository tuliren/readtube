import type { List, Root, RootContent } from 'mdast';

/**
 * Remark plugin that flattens an all-bullet document into plain
 * paragraphs. The summary prompt forbids writing the entire summary as
 * bullets, but the model sometimes disobeys and wraps every paragraph
 * in a list item. When that happens, rendering the markers adds noise
 * without structure — so each bullet is unwrapped into a top-level
 * paragraph instead.
 *
 * The transform only fires when EVERY top-level block is an unordered
 * list. Mixed documents (prose followed by a list) keep their bullets —
 * those lists are intentional per the prompt rules. Ordered lists never
 * trigger it either: stripping numbers from steps or rankings would
 * lose meaning.
 *
 * Runs on the mdast tree inside the parse pass react-markdown already
 * performs, so the cost is one shallow scan of the root children plus
 * a flatten when triggered — no re-parse, no string copying.
 */
export default function remarkBulletsToParagraphs() {
  return (tree: Root) => {
    const blocks = tree.children;
    if (blocks.length === 0) {
      return;
    }
    if (!blocks.every((block) => block.type === 'list' && block.ordered !== true)) {
      return;
    }
    tree.children = blocks.flatMap((block) => unwrapList(block as List));
  };
}

/** Hoist each list item's blocks, recursing through nested lists. */
function unwrapList(list: List): RootContent[] {
  return list.children.flatMap((item) =>
    item.children.flatMap((child) => (child.type === 'list' ? unwrapList(child) : [child]))
  );
}

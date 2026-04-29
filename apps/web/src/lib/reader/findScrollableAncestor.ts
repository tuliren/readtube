/** Walks up the DOM from a given element until it finds an ancestor
 *  whose computed `overflow-y` declares it scrollable. Deliberately
 *  does NOT compare `scrollHeight > clientHeight` — that test is
 *  racy during streaming content updates, and any `overflow: auto`
 *  container that becomes scrollable later will start firing scroll
 *  events we already care about. The reader's scroll container is a
 *  flex child, not `window` or `document.scrollingElement`, so this
 *  sniff is how we discover it from inside.
 */
export function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let current = el.parentElement;
  while (current != null) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

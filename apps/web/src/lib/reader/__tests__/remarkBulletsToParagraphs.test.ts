import type { List, ListItem, Paragraph, Root, RootContent } from 'mdast';

import remarkBulletsToParagraphs from '../remarkBulletsToParagraphs';

// Hand-built mdast trees instead of a real remark parse: unified and
// remark-parse are ESM-only and Jest can't load them without extra
// transform config. The Storybook play tests cover the full
// parse-and-render path; these tests pin down the transformer logic.

function paragraph(text: string): Paragraph {
  return { type: 'paragraph', children: [{ type: 'text', value: text }] };
}

function bulletList(...items: ListItem[]): List {
  return { type: 'list', ordered: false, spread: false, children: items };
}

function orderedList(...items: ListItem[]): List {
  return { type: 'list', ordered: true, spread: false, children: items };
}

function item(...children: ListItem['children']): ListItem {
  return { type: 'listItem', spread: false, children };
}

function root(...children: RootContent[]): Root {
  return { type: 'root', children };
}

function transform(tree: Root): Root {
  remarkBulletsToParagraphs()(tree);
  return tree;
}

describe('remarkBulletsToParagraphs', () => {
  it('unwraps a document that is a single bullet list into paragraphs', () => {
    const tree = root(bulletList(item(paragraph('first')), item(paragraph('second'))));
    expect(transform(tree)).toEqual(root(paragraph('first'), paragraph('second')));
  });

  it('unwraps a single bullet holding one long paragraph', () => {
    const tree = root(bulletList(item(paragraph('one long paragraph'))));
    expect(transform(tree)).toEqual(root(paragraph('one long paragraph')));
  });

  it('unwraps multiple consecutive bullet lists', () => {
    const tree = root(
      bulletList(item(paragraph('a')), item(paragraph('b'))),
      bulletList(item(paragraph('c')))
    );
    expect(transform(tree)).toEqual(root(paragraph('a'), paragraph('b'), paragraph('c')));
  });

  it('keeps every block of a loose list item as its own paragraph', () => {
    const tree = root(bulletList(item(paragraph('lead'), paragraph('follow-up'))));
    expect(transform(tree)).toEqual(root(paragraph('lead'), paragraph('follow-up')));
  });

  it('flattens nested bullet lists into the paragraph sequence', () => {
    const tree = root(bulletList(item(paragraph('parent'), bulletList(item(paragraph('nested'))))));
    expect(transform(tree)).toEqual(root(paragraph('parent'), paragraph('nested')));
  });

  it.each<[string, Root]>([
    ['prose before a list', root(paragraph('intro'), bulletList(item(paragraph('a'))))],
    ['prose after a list', root(bulletList(item(paragraph('a'))), paragraph('outro'))],
    ['an ordered list', root(orderedList(item(paragraph('step 1'))))],
    [
      'a bullet list alongside an ordered list',
      root(bulletList(item(paragraph('a'))), orderedList(item(paragraph('step 1')))),
    ],
    ['only paragraphs', root(paragraph('a'), paragraph('b'))],
    ['an empty document', root()],
  ])('leaves %s untouched', (_label, tree) => {
    const before = structuredClone(tree);
    expect(transform(tree)).toEqual(before);
  });
});

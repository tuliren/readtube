import {
  CURRENT_FRONTMATTER_VERSION,
  parseMarkdownDocument,
  serializeMarkdownDocument,
} from '@/lib/markdownFrontmatter';

describe('parseMarkdownDocument', () => {
  it.each([
    { label: 'empty string', input: '' },
    { label: 'plain text', input: 'Hello world.' },
    { label: 'markdown with dollar signs', input: 'Price is $5 and $10.' },
    { label: 'divider in body', input: 'intro\n\n---\n\nafter divider' },
  ])('returns raw content with empty properties for $label', ({ input }) => {
    expect(parseMarkdownDocument(input)).toEqual({
      content: input,
      properties: {},
      frontmatterPending: false,
    });
  });

  it('parses a v1 frontmatter block', () => {
    const input = '---\nversion: v1\nhasLatex: true\n---\n\nHello $x$.';
    expect(parseMarkdownDocument(input)).toEqual({
      content: 'Hello $x$.',
      properties: { version: 'v1', hasLatex: true },
      frontmatterPending: false,
    });
  });

  it.each([
    { input: '---\nhasLatex: true\n---\n\nbody', expected: true },
    { input: '---\nhasLatex: false\n---\n\nbody', expected: false },
  ])('coerces hasLatex=$expected', ({ input, expected }) => {
    const { properties } = parseMarkdownDocument(input);
    expect(properties.hasLatex).toBe(expected);
  });

  it('keeps version as a string even when it looks numeric-ish', () => {
    const input = '---\nversion: v1\n---\n\nbody';
    const { properties } = parseMarkdownDocument(input);
    expect(properties.version).toBe('v1');
  });

  it('preserves unknown keys as strings', () => {
    const input = '---\nversion: v1\ncustom: hello world\n---\n\nbody';
    const { properties } = parseMarkdownDocument(input);
    expect(properties.custom).toBe('hello world');
  });

  it('skips blank and malformed lines inside the fence', () => {
    const input = '---\nversion: v1\n\nnocolon\nhasLatex: true\n---\n\nbody';
    const { properties } = parseMarkdownDocument(input);
    expect(properties).toEqual({ version: 'v1', hasLatex: true });
  });

  it('flags a pending frontmatter when the opener is present but the closer is not', () => {
    const input = '---\nversion: v1\nhasLatex:';
    expect(parseMarkdownDocument(input)).toEqual({
      content: input,
      properties: {},
      frontmatterPending: true,
    });
  });

  it('does not flag pending when the body just happens to contain "---"', () => {
    const input = 'intro\n---\nmid\n---';
    expect(parseMarkdownDocument(input).frontmatterPending).toBe(false);
  });

  it('handles a frontmatter block with no body', () => {
    const input = '---\nversion: v1\nhasLatex: false\n---';
    expect(parseMarkdownDocument(input)).toEqual({
      content: '',
      properties: { version: 'v1', hasLatex: false },
      frontmatterPending: false,
    });
  });
});

describe('serializeMarkdownDocument', () => {
  it('returns bare content when no properties are set', () => {
    expect(serializeMarkdownDocument('hello', {})).toBe('hello');
  });

  it('emits a v1 frontmatter block', () => {
    expect(
      serializeMarkdownDocument('body text', {
        version: CURRENT_FRONTMATTER_VERSION,
        hasLatex: true,
      })
    ).toBe('---\nversion: v1\nhasLatex: true\n---\n\nbody text');
  });

  it('round-trips through parseMarkdownDocument', () => {
    const properties = { version: CURRENT_FRONTMATTER_VERSION, hasLatex: false } as const;
    const serialized = serializeMarkdownDocument('some body', properties);
    expect(parseMarkdownDocument(serialized)).toEqual({
      content: 'some body',
      properties,
      frontmatterPending: false,
    });
  });
});

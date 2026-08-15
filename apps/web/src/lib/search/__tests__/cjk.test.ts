import {
  buildCjkSnippet,
  containsCjk,
  likePattern,
  markMatches,
  searchTerms,
} from '@/lib/search/cjk';

describe('containsCjk', () => {
  it.each([
    ['Han characters', '诺兰', true],
    ['mixed CJK and Latin', '诺兰 interview', true],
    ['Hiragana', 'こんにちは', true],
    ['Katakana', 'カタカナ', true],
    ['Hangul', '한국어', true],
    ['traditional Han', '薩爾達傳說', true],
    ['pure Latin', 'nolan interview', false],
    ['Latin with accents', 'café résumé', false],
    ['digits and punctuation', '123 !?', false],
    ['empty string', '', false],
  ])('%s: %j is %s', (_name, text, expected) => {
    expect(containsCjk(text)).toBe(expected);
  });
});

describe('searchTerms', () => {
  it.each([
    ['splits on whitespace', '诺兰 电影', ['诺兰', '电影']],
    ['trims and collapses runs of whitespace', '  诺兰   电影  ', ['诺兰', '电影']],
    ['single term', '诺兰', ['诺兰']],
    ['empty query', '   ', []],
  ])('%s', (_name, query, expected) => {
    expect(searchTerms(query)).toEqual(expected);
  });

  it('caps the term count', () => {
    expect(searchTerms('a b c d e f g h i j')).toHaveLength(8);
  });
});

describe('likePattern', () => {
  it.each([
    ['wraps in wildcards', '诺兰', '%诺兰%'],
    ['escapes percent', '100%', '%100\\%%'],
    ['escapes underscore', 'a_b', '%a\\_b%'],
    ['escapes backslash', 'a\\b', '%a\\\\b%'],
  ])('%s', (_name, term, expected) => {
    expect(likePattern(term)).toBe(expected);
  });
});

describe('markMatches', () => {
  it.each([
    ['single hit', '对话诺兰！', ['诺兰'], '对话[[诺兰]]！'],
    ['multiple terms', '诺兰的电影', ['诺兰', '电影'], '[[诺兰]]的[[电影]]'],
    ['repeated hits', '诺兰谈诺兰', ['诺兰'], '[[诺兰]]谈[[诺兰]]'],
    ['case-insensitive Latin', 'Nolan on nolan', ['nolan'], '[[Nolan]] on [[nolan]]'],
    ['overlapping terms merge', 'abcd', ['abc', 'bcd'], '[[abcd]]'],
    ['no hits leaves text untouched', '对话诺兰', ['电影'], '对话诺兰'],
  ])('%s', (_name, text, terms, expected) => {
    expect(markMatches(text, terms)).toBe(expected);
  });
});

describe('buildCjkSnippet', () => {
  it('returns null when no term appears', () => {
    expect(buildCjkSnippet('一段没有匹配的描述', ['电影'])).toBeNull();
  });

  it('marks the hit without ellipses when the description is short', () => {
    expect(buildCjkSnippet('大导演诺兰的新作', ['诺兰'])).toBe('大导演[[诺兰]]的新作');
  });

  it('windows a long description around the first hit with ellipses', () => {
    const long = `${'前'.repeat(50)}诺兰${'后'.repeat(100)}`;
    const snippet = buildCjkSnippet(long, ['诺兰']);
    expect(snippet).not.toBeNull();
    expect(snippet).toContain('[[诺兰]]');
    expect(snippet?.startsWith('…')).toBe(true);
    expect(snippet?.endsWith('…')).toBe(true);
    // 80-char window plus ellipses and the [[ ]] delimiters.
    expect(snippet!.length).toBeLessThanOrEqual(80 + 2 + 4);
  });
});

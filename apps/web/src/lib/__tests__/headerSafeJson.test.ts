import { headerSafeJson } from '../http/headerSafeJson';

describe('headerSafeJson', () => {
  it('passes ASCII through unchanged', () => {
    expect(headerSafeJson({ a: 'hello', b: 1 })).toBe('{"a":"hello","b":1}');
  });

  it('escapes the right single quote (U+2019) — the original crash repro', () => {
    // Title pattern that triggered the runtime TypeError:
    //   "Cannot convert argument to a ByteString because the character
    //    at index 395 has a value of 8217 which is greater than 255."
    const out = headerSafeJson({ title: 'what’s next' });
    expect(out).toBe('{"title":"what\\u2019s next"}');
    // Round-trips back to the original character via the standard parser.
    expect(JSON.parse(out)).toEqual({ title: 'what’s next' });
  });

  it.each<{ input: string; codepoint: string; desc: string }>([
    { input: 'café', codepoint: '\\u00e9', desc: 'Latin-1 é (still > 0x7F)' },
    { input: 'em — dash', codepoint: '\\u2014', desc: 'em dash' },
    { input: '左 — right', codepoint: '\\u5de6', desc: 'CJK ideograph' },
    { input: '한글', codepoint: '\\ud55c', desc: 'Hangul syllable' },
  ])('escapes $desc', ({ input, codepoint }) => {
    const encoded = headerSafeJson({ s: input });
    expect(encoded).toContain(codepoint);
    // The escaped output is pure ASCII — every codepoint <= 0x7F.
    for (let i = 0; i < encoded.length; i += 1) {
      expect(encoded.charCodeAt(i)).toBeLessThanOrEqual(0x7f);
    }
    expect(JSON.parse(encoded)).toEqual({ s: input });
  });

  it('escapes both halves of a surrogate pair (codepoint > U+FFFF)', () => {
    // 🚀 = U+1F680, encoded in UTF-16 as the surrogate pair
    // U+D83D U+DE80. Both halves are > 0x7F, so both get escaped.
    const out = headerSafeJson({ s: '🚀' });
    expect(out).toBe('{"s":"\\ud83d\\ude80"}');
    expect(JSON.parse(out)).toEqual({ s: '🚀' });
  });

  it('preserves arrays, nested objects, and primitives', () => {
    const value = {
      list: ['a', 'café', 1, null, true],
      nested: { greeting: 'こんにちは' },
    };
    const out = headerSafeJson(value);
    // ASCII only
    for (let i = 0; i < out.length; i += 1) {
      expect(out.charCodeAt(i)).toBeLessThanOrEqual(0x7f);
    }
    // Faithful round-trip
    expect(JSON.parse(out)).toEqual(value);
  });
});

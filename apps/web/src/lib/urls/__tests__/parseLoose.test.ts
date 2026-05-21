import { parseUrlLoose } from '../parseLoose';

describe('parseUrlLoose', () => {
  it.each([
    ['protocol URL', 'https://youtube.com/@mreflow', 'youtube.com', '/@mreflow'],
    ['http protocol', 'http://example.com/foo', 'example.com', '/foo'],
    ['protocol-less URL', 'youtube.com/@mreflow', 'youtube.com', '/@mreflow'],
    ['protocol-less www URL', 'www.youtube.com/watch', 'www.youtube.com', '/watch'],
    ['protocol-less youtu.be', 'youtu.be/dQw4w9WgXcQ', 'youtu.be', '/dQw4w9WgXcQ'],
    ['whitespace padded', '  youtube.com/@x  ', 'youtube.com', '/@x'],
  ])('parses %s', (_label, input, hostname, pathname) => {
    const url = parseUrlLoose(input);
    expect(url).not.toBeNull();
    expect(url?.hostname).toBe(hostname);
    expect(url?.pathname).toBe(pathname);
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['null', null as unknown as string],
    ['undefined', undefined as unknown as string],
    ['non-string', 42 as unknown as string],
    ['text with space', 'not a url'],
  ])('returns null for %s', (_label, input) => {
    expect(parseUrlLoose(input)).toBeNull();
  });

  it('does not re-prepend https when input already has a scheme', () => {
    expect(parseUrlLoose('ftp://example.com')?.protocol).toBe('ftp:');
  });
});

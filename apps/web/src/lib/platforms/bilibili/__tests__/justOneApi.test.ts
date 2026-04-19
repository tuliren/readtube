import { parseDurationSeconds, parseResponse, parseTimestamp } from '../justOneApi';

describe('parseTimestamp', () => {
  it.each([
    ['10-digit seconds', 1_700_000_000, new Date(1_700_000_000 * 1000)],
    ['13-digit millis', 1_700_000_000_000, new Date(1_700_000_000_000)],
    ['numeric string of seconds', '1700000000', new Date(1_700_000_000 * 1000)],
    ['ISO string', '2026-04-18T12:00:00Z', new Date('2026-04-18T12:00:00Z')],
  ])('parses %s', (_label, input, expected) => {
    expect(parseTimestamp(input as number | string | null)).toEqual(expected);
  });

  it.each([
    ['null', null],
    ['zero', 0],
    ['negative', -1],
    ['empty string', ''],
    ['garbage', 'not a date'],
  ])('returns null for %s', (_label, input) => {
    expect(parseTimestamp(input as number | string | null)).toBeNull();
  });
});

describe('parseDurationSeconds', () => {
  it.each([
    ['int seconds', 1238, 1238],
    ['numeric string of seconds', '1238', 1238],
    ['M:SS', '5:23', 323],
    ['H:MM:SS', '1:02:30', 3750],
  ])('parses %s', (_label, input, expected) => {
    expect(parseDurationSeconds(input as number | string | null)).toBe(expected);
  });

  it.each([
    ['null', null],
    ['zero', 0],
    ['negative', -1],
    ['empty', ''],
    ['garbage', 'foo'],
    ['four parts', '1:2:3:4'],
  ])('returns null for %s', (_label, input) => {
    expect(parseDurationSeconds(input as number | string | null)).toBeNull();
  });
});

describe('parseResponse — Bilibili-style envelope (vlist under data.list.vlist)', () => {
  it('extracts videos + channel from a wbi/arc/search-shaped body', () => {
    const body = {
      code: 0,
      data: {
        list: {
          vlist: [
            {
              bvid: 'BV1DgdhBGEq2',
              title: '终于来了！大疆Pocket 4上手',
              description: 'Pocket 4 review',
              pic: '//i0.hdslb.com/bfs/archive/thumb1.jpg',
              created: 1_700_000_000,
              length: '20:38',
              mid: 946974,
              author: '影视飓风',
            },
            {
              bvid: 'BV1NGZtBwELa',
              title: '4K limited sample',
              description: '',
              pic: 'https://i1.hdslb.com/bfs/archive/thumb2.jpg',
              created: 1_699_900_000,
              length: '3:39',
            },
          ],
        },
        page: { count: 2, pn: 1, ps: 30 },
      },
    };
    const result = parseResponse('946974', body);
    expect(result.videos).toHaveLength(2);
    expect(result.videos[0]).toEqual({
      videoId: 'BV1DgdhBGEq2',
      title: '终于来了！大疆Pocket 4上手',
      description: 'Pocket 4 review',
      thumbnailUrl: 'https://i0.hdslb.com/bfs/archive/thumb1.jpg',
      publishedAt: new Date(1_700_000_000 * 1000),
      durationSeconds: 1238,
    });
    expect(result.videos[1].durationSeconds).toBe(219);
    // Inline author/mid on the first video becomes the channel.
    expect(result.channel.name).toBe('影视飓风');
    // mid falls back to the caller-provided value when not found.
    expect(result.channel.mid).toBe('946974');
  });
});

describe('parseResponse — flat array under data.videos', () => {
  it('extracts from an alternate envelope with a top-level videos[]', () => {
    const body = {
      code: 0,
      data: {
        videos: [
          {
            bv_id: 'BV1xxx',
            title: 'Example',
            cover: '//i0.hdslb.com/bfs/archive/example.jpg',
            publish_time: 1_700_000_000,
            duration: 600,
          },
        ],
        user: {
          uid: 946974,
          name: 'Test Channel',
          face: 'https://i0.hdslb.com/avatar.jpg',
        },
      },
    };
    const result = parseResponse('946974', body);
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe('BV1xxx');
    expect(result.videos[0].durationSeconds).toBe(600);
    expect(result.channel.name).toBe('Test Channel');
    expect(result.channel.logoUrl).toBe('https://i0.hdslb.com/avatar.jpg');
  });
});

describe('parseResponse — missing / malformed', () => {
  it('returns empty video array when no arrays look like videos', () => {
    const result = parseResponse('946974', { code: 0, data: { page: { count: 0 } } });
    expect(result.videos).toEqual([]);
    expect(result.channel.mid).toBe('946974');
  });

  it('drops items missing both bvid and title', () => {
    const body = {
      code: 0,
      data: {
        list: {
          vlist: [{ bvid: 'BV1aaa', title: 'ok' }, { title: 'no id' }, { bvid: 'BV1bbb' }],
        },
      },
    };
    const result = parseResponse('946974', body);
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe('BV1aaa');
  });

  it('normalizes protocol-relative and http:// thumbnail URLs', () => {
    const body = {
      code: 0,
      data: {
        list: {
          vlist: [
            {
              bvid: 'BV1p',
              title: 'p',
              pic: '//i0.hdslb.com/p.jpg',
            },
            {
              bvid: 'BV1h',
              title: 'h',
              pic: 'http://i0.hdslb.com/h.jpg',
            },
          ],
        },
      },
    };
    const result = parseResponse('946974', body);
    expect(result.videos[0].thumbnailUrl).toBe('https://i0.hdslb.com/p.jpg');
    expect(result.videos[1].thumbnailUrl).toBe('https://i0.hdslb.com/h.jpg');
  });
});

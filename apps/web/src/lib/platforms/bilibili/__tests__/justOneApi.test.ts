import { normalizeThumbnail, parseResponse } from '../justOneApi';

const REAL_ENVELOPE_FIXTURE = {
  code: 0,
  data: {
    code: 0,
    message: 'OK',
    ttl: 1,
    data: {
      episodic_button: { text: '播放全部', uri: '...' },
      order: [
        { title: '最新发布', value: 'pubdate' },
        { title: '最多播放', value: 'click' },
      ],
      count: 93,
      item: [
        {
          title: '高等数学（下册）期末必做题｜750题｜宋浩老师',
          subtitle: '',
          tname: '校园学习',
          cover: 'http://i1.hdslb.com/bfs/archive/0e566f7f86664d8f139d36210d095a447d0e60cc.jpg',
          uri: '...huge...',
          param: '116354506032318',
          goto: 'av',
          length: '',
          duration: 3958,
          play: 33342,
          danmaku: 8,
          ctime: 1_775_437_200,
          author: '宋浩老师官方',
          bvid: 'BV1H7S9B5ENL',
          videos: 19,
          publish_time_text: '4月6日',
        },
        {
          title: 'Second video',
          subtitle: 'short description',
          cover: '//i0.hdslb.com/bfs/archive/second.jpg',
          duration: 754,
          ctime: 1_700_000_000,
          author: '宋浩老师官方',
          bvid: 'BV1SECOND0001',
        },
      ],
      has_next: true,
      has_prev: false,
    },
  },
  message: null,
  recordTime: '2026-04-19T12:34:39.320387995',
};

describe('parseResponse against the real JustOneAPI envelope', () => {
  it('extracts every item at body.data.data.item[]', () => {
    const result = parseResponse('946974', REAL_ENVELOPE_FIXTURE as Record<string, unknown>);
    expect(result.videos).toHaveLength(2);
  });

  it('maps the first item correctly', () => {
    const result = parseResponse('946974', REAL_ENVELOPE_FIXTURE as Record<string, unknown>);
    expect(result.videos[0]).toEqual({
      videoId: 'BV1H7S9B5ENL',
      title: '高等数学（下册）期末必做题｜750题｜宋浩老师',
      description: '',
      thumbnailUrl: 'http://i1.hdslb.com/bfs/archive/0e566f7f86664d8f139d36210d095a447d0e60cc.jpg',
      publishedAt: new Date(1_775_437_200 * 1000),
      durationSeconds: 3958,
    });
  });

  it('normalizes protocol-relative covers on later items', () => {
    const result = parseResponse('946974', REAL_ENVELOPE_FIXTURE as Record<string, unknown>);
    expect(result.videos[1].thumbnailUrl).toBe('http://i0.hdslb.com/bfs/archive/second.jpg');
    expect(result.videos[1].description).toBe('short description');
  });

  it('derives channel name from the first item author', () => {
    const result = parseResponse('946974', REAL_ENVELOPE_FIXTURE as Record<string, unknown>);
    expect(result.channel.name).toBe('宋浩老师官方');
    expect(result.channel.mid).toBe('946974');
    // Avatar is never in this response shape — channelSnapshot backfills it.
    expect(result.channel.logoUrl).toBeNull();
  });

  it('keeps the raw envelope on the result', () => {
    const result = parseResponse('946974', REAL_ENVELOPE_FIXTURE as Record<string, unknown>);
    expect(result.raw).toBe(REAL_ENVELOPE_FIXTURE);
  });
});

describe('parseResponse — missing / malformed', () => {
  it('returns empty videos and null channel name when item[] is empty', () => {
    const result = parseResponse('946974', {
      code: 0,
      data: { code: 0, data: { item: [] } },
    });
    expect(result.videos).toEqual([]);
    expect(result.channel.name).toBeNull();
    expect(result.channel.mid).toBe('946974');
  });

  it('returns empty videos when item[] is missing entirely', () => {
    const result = parseResponse('946974', {
      code: 0,
      data: { code: 0, data: {} },
    });
    expect(result.videos).toEqual([]);
  });

  it('drops items missing bvid', () => {
    const result = parseResponse('946974', {
      code: 0,
      data: {
        code: 0,
        data: {
          item: [
            { bvid: 'BV1ok', title: 'ok', cover: '', duration: 100, ctime: 1, author: 'a' },
            { title: 'no bvid', cover: '', duration: 100, ctime: 1, author: 'a' },
          ],
        },
      },
    });
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe('BV1ok');
  });

  it('drops items missing title', () => {
    const result = parseResponse('946974', {
      code: 0,
      data: {
        code: 0,
        data: {
          item: [{ bvid: 'BV1nope', cover: '', duration: 100, ctime: 1, author: 'a' }],
        },
      },
    });
    expect(result.videos).toHaveLength(0);
  });

  it('emits null publishedAt when ctime is missing or non-positive', () => {
    const result = parseResponse('946974', {
      code: 0,
      data: {
        code: 0,
        data: {
          item: [
            { bvid: 'BV1a', title: 'a', cover: '', duration: 100, ctime: 0, author: '' },
            { bvid: 'BV1b', title: 'b', cover: '', duration: 100, author: '' },
          ],
        },
      },
    });
    expect(result.videos[0].publishedAt).toBeNull();
    expect(result.videos[1].publishedAt).toBeNull();
  });

  it('emits null durationSeconds when duration is missing or non-positive', () => {
    const result = parseResponse('946974', {
      code: 0,
      data: {
        code: 0,
        data: {
          item: [
            { bvid: 'BV1a', title: 'a', cover: '', ctime: 1, author: '' },
            { bvid: 'BV1b', title: 'b', cover: '', ctime: 1, duration: 0, author: '' },
          ],
        },
      },
    });
    expect(result.videos[0].durationSeconds).toBeNull();
    expect(result.videos[1].durationSeconds).toBeNull();
  });
});

describe('normalizeThumbnail', () => {
  it.each([
    ['protocol-relative → http', '//i0.hdslb.com/p.jpg', 'http://i0.hdslb.com/p.jpg'],
    ['http passthrough', 'http://i0.hdslb.com/p.jpg', 'http://i0.hdslb.com/p.jpg'],
    ['https downgraded to http', 'https://i0.hdslb.com/p.jpg', 'http://i0.hdslb.com/p.jpg'],
  ])('normalizes %s', (_label, input, expected) => {
    expect(normalizeThumbnail(input)).toBe(expected);
  });

  it.each([
    ['null', null],
    ['empty', ''],
  ])('returns empty string for %s', (_label, input) => {
    expect(normalizeThumbnail(input)).toBe('');
  });
});

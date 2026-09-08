import { SubtitleFetchError } from '@/lib/platforms/types';

import { fetchBilibiliTranscriptViaJustOneApi } from '../justOneApi';
import { type KedouSubtitleResponse, fetchKedouBilibiliSubtitle } from '../kedouSubtitle';
import { fetchBilibiliTranscript } from '../transcript';
import { resolveBilibiliAidCid } from '../videoView';

jest.mock('../justOneApi', () => ({
  fetchBilibiliTranscriptViaJustOneApi: jest.fn(),
}));

jest.mock('../kedouSubtitle', () => ({
  fetchKedouBilibiliSubtitle: jest.fn(),
}));

jest.mock('../videoView', () => ({
  resolveBilibiliAidCid: jest.fn(),
}));

const mockResolve = resolveBilibiliAidCid as jest.MockedFunction<typeof resolveBilibiliAidCid>;
const mockJustOne = fetchBilibiliTranscriptViaJustOneApi as jest.MockedFunction<
  typeof fetchBilibiliTranscriptViaJustOneApi
>;
const mockKedou = fetchKedouBilibiliSubtitle as jest.MockedFunction<
  typeof fetchKedouBilibiliSubtitle
>;

const BVID = 'BV1TEST000001';
const IDS = { aid: '123456', cid: '777' };
const JUSTONE_RESULT = { segments: [{ startMs: 0, endMs: 1000, text: '你好' }], language: 'zh-CN' };
const SRT = '1\n00:00:00,000 --> 00:00:01,000\nhello\n';

function kedouResponse(items: Array<{ lang: string; content: string }>): KedouSubtitleResponse {
  return {
    code: 200,
    message: 'ok',
    data: {
      vid: BVID,
      host: 'bilibili.com',
      hostAlias: 'bilibili',
      title: 'A video',
      status: 'ok',
      subtitleItemVoList: items.map((item) => ({ ...item, langDesc: item.lang })),
    },
  };
}

beforeEach(() => {
  mockResolve.mockReset();
  mockJustOne.mockReset();
  mockKedou.mockReset();
});

describe('fetchBilibiliTranscript', () => {
  it('uses JustOneAPI with the resolved aid/cid and never calls kedou', async () => {
    mockResolve.mockResolvedValueOnce(IDS);
    mockJustOne.mockResolvedValueOnce(JUSTONE_RESULT);

    await expect(fetchBilibiliTranscript(BVID)).resolves.toEqual(JUSTONE_RESULT);

    expect(mockJustOne).toHaveBeenCalledWith(BVID, IDS);
    expect(mockKedou).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'the aid/cid lookup fails',
      arrange: () => mockResolve.mockRejectedValueOnce(new Error('view unavailable')),
    },
    {
      label: 'the captions call fails',
      arrange: () => {
        mockResolve.mockResolvedValueOnce(IDS);
        mockJustOne.mockRejectedValueOnce(new Error('no tracks'));
      },
    },
  ])('falls back to kedou when $label', async ({ arrange }) => {
    arrange();
    mockKedou.mockResolvedValueOnce(kedouResponse([{ lang: '中文', content: SRT }]));

    const result = await fetchBilibiliTranscript(BVID);

    expect(result.language).toBe('中文');
    expect(result.segments).toEqual([{ startMs: 0, endMs: 1000, text: 'hello' }]);
  });

  it.each([
    {
      label: 'kedou reports no subtitles',
      kedou: () => mockKedou.mockResolvedValueOnce(kedouResponse([])),
      transient: false,
    },
    {
      label: 'the kedou request fails',
      kedou: () => mockKedou.mockRejectedValueOnce(new Error('timeout')),
      transient: true,
    },
    {
      label: 'kedou returns an error code',
      kedou: () => mockKedou.mockResolvedValueOnce({ code: 500, message: 'boom' }),
      transient: true,
    },
  ])(
    'combines both failures and lets kedou decide permanence when $label',
    async ({ kedou, transient }) => {
      mockResolve.mockRejectedValueOnce(new Error('view unavailable'));
      kedou();

      const promise = fetchBilibiliTranscript(BVID);

      await expect(promise).rejects.toBeInstanceOf(SubtitleFetchError);
      await expect(promise).rejects.toMatchObject({
        transient,
        message: expect.stringContaining('JustOneAPI: view unavailable; Kedou:'),
      });
    }
  );
});

import { extractBlockReason } from '@/lib/ai/geminiVideo';

describe('extractBlockReason', () => {
  it.each<{
    desc: string;
    data: Parameters<typeof extractBlockReason>[0];
    expected: string | null;
  }>([
    {
      desc: 'prompt-level block with no candidate (the PROHIBITED_CONTENT case)',
      data: { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } },
      expected: 'PROHIBITED_CONTENT',
    },
    {
      desc: 'candidate finishReason SAFETY',
      data: { candidates: [{ finishReason: 'SAFETY' }] },
      expected: 'SAFETY',
    },
    {
      desc: 'candidate finishReason RECITATION',
      data: { candidates: [{ finishReason: 'RECITATION' }] },
      expected: 'RECITATION',
    },
    {
      desc: 'prompt block wins over candidate finishReason',
      data: {
        promptFeedback: { blockReason: 'BLOCKLIST' },
        candidates: [{ finishReason: 'STOP' }],
      },
      expected: 'BLOCKLIST',
    },
  ])('returns the block reason for $desc', ({ data, expected }) => {
    expect(extractBlockReason(data)).toBe(expected);
  });

  it.each<{ desc: string; data: Parameters<typeof extractBlockReason>[0] }>([
    { desc: 'a normal STOP finish', data: { candidates: [{ finishReason: 'STOP' }] } },
    {
      desc: 'a token-ceiling MAX_TOKENS finish',
      data: { candidates: [{ finishReason: 'MAX_TOKENS' }] },
    },
    { desc: 'no candidate and no promptFeedback', data: {} },
    { desc: 'an empty blockReason string', data: { promptFeedback: { blockReason: '' } } },
  ])('returns null for $desc', ({ data }) => {
    expect(extractBlockReason(data)).toBeNull();
  });
});

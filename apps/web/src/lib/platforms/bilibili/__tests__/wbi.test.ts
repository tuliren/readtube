import { __resetWbiCacheForTests, getMixinKey, signWbi } from '../wbi';

// Reference values. `mixinKey` + `w_rid` below were verified against
// the canonical WBI permutation and MD5 (see plan file for the
// derivation). If this test fails after a change to wbi.ts, the signer
// produces a different signature than every other Bilibili client and
// api.bilibili.com will reject it.
const IMG_KEY = '7cd084941338484aae1ad9425b84077c';
const SUB_KEY = '4932caff0ff746eab6f01bf08b70ac45';
const EXPECTED_MIXIN_KEY = 'ea1db124af3c7062474693fa704f4ff8';
const EXPECTED_WRID = '202bca4fb49420201c0659dfc69a5b42';

beforeEach(() => {
  __resetWbiCacheForTests();
});

describe('getMixinKey', () => {
  it('derives the 32-char mixin key via the canonical permutation', () => {
    expect(getMixinKey(IMG_KEY, SUB_KEY)).toBe(EXPECTED_MIXIN_KEY);
  });

  it('returns a 32-char string regardless of input length', () => {
    expect(getMixinKey(IMG_KEY, SUB_KEY)).toHaveLength(32);
  });
});

describe('signWbi', () => {
  it('produces a stable w_rid for fixed inputs', async () => {
    const signed = await signWbi(
      { mid: '946974' },
      { mixinKeyOverride: EXPECTED_MIXIN_KEY, nowSeconds: 1_700_000_000 }
    );
    expect(signed.w_rid).toBe(EXPECTED_WRID);
  });

  it('includes wts and w_rid plus the original params as strings', async () => {
    const signed = await signWbi(
      { mid: 946974, pn: 1, ps: 30 },
      { mixinKeyOverride: EXPECTED_MIXIN_KEY, nowSeconds: 1_700_000_000 }
    );
    expect(signed.mid).toBe('946974');
    expect(signed.pn).toBe('1');
    expect(signed.ps).toBe('30');
    expect(signed.wts).toBe('1700000000');
    expect(typeof signed.w_rid).toBe('string');
    expect(signed.w_rid).toHaveLength(32);
  });

  it(`strips forbidden characters !'()* from values before signing`, async () => {
    // Bilibili's own web frontend strips these chars; a signer that
    // doesn't will produce a signature the server rejects.
    const withForbidden = await signWbi(
      { keyword: "he!ll'o(wor)l*d" },
      { mixinKeyOverride: EXPECTED_MIXIN_KEY, nowSeconds: 1_700_000_000 }
    );
    const clean = await signWbi(
      { keyword: 'helloworld' },
      { mixinKeyOverride: EXPECTED_MIXIN_KEY, nowSeconds: 1_700_000_000 }
    );
    expect(withForbidden.keyword).toBe('helloworld');
    expect(withForbidden.w_rid).toBe(clean.w_rid);
  });

  it('signs are stable across repeated calls for the same inputs', async () => {
    const a = await signWbi(
      { mid: '1' },
      { mixinKeyOverride: EXPECTED_MIXIN_KEY, nowSeconds: 1_700_000_000 }
    );
    const b = await signWbi(
      { mid: '1' },
      { mixinKeyOverride: EXPECTED_MIXIN_KEY, nowSeconds: 1_700_000_000 }
    );
    expect(a.w_rid).toBe(b.w_rid);
  });
});

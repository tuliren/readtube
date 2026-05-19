import { parseDurationText, scrapeChannel } from '../channelScrape';

describe('parseDurationText', () => {
  it.each<{ input: string | null | undefined; expected: number | null; desc: string }>([
    { input: '0:42', expected: 42, desc: 'm:ss under one minute' },
    { input: '12:34', expected: 12 * 60 + 34, desc: 'mm:ss' },
    { input: '1:02:03', expected: 3600 + 2 * 60 + 3, desc: 'h:mm:ss' },
    { input: '0:00', expected: 0, desc: 'all-zero duration' },
    { input: '  4:20  ', expected: 4 * 60 + 20, desc: 'whitespace tolerated' },
    { input: '', expected: null, desc: 'empty string' },
    { input: undefined, expected: null, desc: 'undefined' },
    { input: null, expected: null, desc: 'null' },
    { input: 'LIVE', expected: null, desc: 'live placeholder is not a duration' },
    { input: '12', expected: null, desc: 'single segment is not parseable' },
    { input: '1:2:3:4', expected: null, desc: 'too many segments' },
    { input: '12:ab', expected: null, desc: 'non-digit segment rejected' },
    { input: '-1:00', expected: null, desc: 'negative segment rejected' },
  ])('$desc', ({ input, expected }) => {
    expect(parseDurationText(input)).toBe(expected);
  });
});

describe('scrapeChannel', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function videoRenderer(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      videoId: 'placeholder',
      title: { runs: [{ text: 'Title' }] },
      lengthText: { simpleText: '12:34' },
      publishedTimeText: { simpleText: '2 weeks ago' },
      ...overrides,
    };
  }

  function buildHtml(videos: Record<string, unknown>[]): string {
    const data = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                title: 'Videos',
                selected: true,
                content: {
                  richGridRenderer: {
                    contents: videos.map((v) => ({
                      richItemRenderer: { content: { videoRenderer: v } },
                    })),
                  },
                },
              },
            },
          ],
        },
      },
    };
    return [
      '<html><head>',
      '<link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv">',
      '<meta property="og:title" content="Test Channel">',
      '<meta property="og:image" content="https://logo.example/x.jpg">',
      '</head><body>',
      `<script>var ytInitialData = ${JSON.stringify(data)};</script>`,
      '</body></html>',
    ].join('');
  }

  it('skips videos with upcomingEventData (scheduled livestreams / premieres)', async () => {
    const html = buildHtml([
      videoRenderer({ videoId: 'aired_vid' }),
      videoRenderer({
        videoId: 'upcoming_stream',
        lengthText: undefined,
        publishedTimeText: undefined,
        upcomingEventData: { startTime: '9999999999' },
      }),
    ]);
    globalThis.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          text: async () => html,
        }) as Response
    );

    const scraped = await scrapeChannel('https://www.youtube.com/@test');

    expect(scraped.videos.map((v) => v.videoId)).toEqual(['aired_vid']);
    // The id is surfaced separately so `mergeSnapshot` can also drop
    // the matching RSS entry — RSS exposes the upload time, not the
    // air time, so its own `published > now` filter misses
    // pre-uploaded premieres.
    expect(scraped.upcomingVideoIds).toEqual(['upcoming_stream']);
  });

  it('extracts aired videos and detects scheduled premieres in the lockupViewModel shape', async () => {
    // Newer rollouts of the /videos tab wrap entries in
    // `lockupViewModel` rather than `videoRenderer`. Upcoming videos
    // there carry no `upcomingEventData` block — the only signal is
    // a "Premieres …" / "waiting" string inside the metadata rows.
    // Aired videos expose title at `metadata.lockupMetadataViewModel
    // .title.content`, relative time as one of the metadata parts,
    // and duration as a thumbnail-overlay badge.
    function lockupItem(opts: {
      contentId: string;
      metadataRowText: string;
      title?: string;
      durationText?: string;
    }): Record<string, unknown> {
      const overlays =
        opts.durationText != null
          ? [
              {
                thumbnailBottomOverlayViewModel: {
                  badges: [{ thumbnailBadgeViewModel: { text: opts.durationText } }],
                },
              },
            ]
          : [];
      return {
        richItemRenderer: {
          content: {
            lockupViewModel: {
              contentId: opts.contentId,
              contentImage: {
                thumbnailViewModel: {
                  overlays,
                },
              },
              metadata: {
                lockupMetadataViewModel: {
                  title: opts.title != null ? { content: opts.title } : undefined,
                  metadata: {
                    contentMetadataViewModel: {
                      metadataRows: [
                        {
                          metadataParts: [{ text: { content: opts.metadataRowText } }],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      };
    }
    const data = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                title: 'Videos',
                selected: true,
                content: {
                  richGridRenderer: {
                    contents: [
                      lockupItem({
                        contentId: 'premiere_id',
                        metadataRowText: 'Premieres 5/15/26, 3:45 AM',
                      }),
                      lockupItem({
                        contentId: 'aired_lockup_id',
                        title: 'Aired Lockup Title',
                        durationText: '43:36',
                        metadataRowText: '2.2K views 20 hours ago',
                      }),
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };
    const html = [
      '<html><head>',
      '<link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv">',
      '<meta property="og:title" content="Test Channel">',
      '<meta property="og:image" content="https://logo.example/x.jpg">',
      '</head><body>',
      `<script>var ytInitialData = ${JSON.stringify(data)};</script>`,
      '</body></html>',
    ].join('');
    globalThis.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          text: async () => html,
        }) as Response
    );

    const scraped = await scrapeChannel('https://www.youtube.com/@test');

    // Aired lockups get extracted as videos (matching the legacy
    // videoRenderer behavior), while upcoming entries — flagged by
    // "Premieres …" / "waiting" text — are pulled out so
    // mergeSnapshot can drop them from the RSS-derived list.
    expect(scraped.videos).toEqual([
      {
        videoId: 'aired_lockup_id',
        title: 'Aired Lockup Title',
        description: '',
        publishedAt: expect.any(Date),
        durationSeconds: 43 * 60 + 36,
      },
    ]);
    expect(scraped.upcomingVideoIds).toEqual(['premiere_id']);
  });

  it('skips members-only videos (lockupViewModel BADGE_MEMBERS_ONLY badge)', async () => {
    // Members-only entries on the lockup rollout carry a
    // `badgeViewModel` with `badgeStyle: "BADGE_MEMBERS_ONLY"` in
    // one of the metadata rows. The watch page is paywalled so
    // pulling them in would just burn a transcript fetch and
    // sticky-lock the entry. Surface the id separately so
    // `mergeSnapshot` can drop a matching RSS entry too.
    const data = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                title: 'Videos',
                selected: true,
                content: {
                  richGridRenderer: {
                    contents: [
                      {
                        richItemRenderer: {
                          content: {
                            lockupViewModel: {
                              contentId: 'members_only_id',
                              contentImage: {
                                thumbnailViewModel: {
                                  overlays: [
                                    {
                                      thumbnailBottomOverlayViewModel: {
                                        badges: [{ thumbnailBadgeViewModel: { text: '15:12' } }],
                                      },
                                    },
                                  ],
                                },
                              },
                              metadata: {
                                lockupMetadataViewModel: {
                                  title: { content: 'Members Only Video' },
                                  metadata: {
                                    contentMetadataViewModel: {
                                      metadataRows: [
                                        { metadataParts: [{ text: { content: '11 hours ago' } }] },
                                        {
                                          badges: [
                                            {
                                              badgeViewModel: {
                                                badgeText: 'Members only',
                                                badgeStyle: 'BADGE_MEMBERS_ONLY',
                                              },
                                            },
                                          ],
                                        },
                                      ],
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                      {
                        richItemRenderer: {
                          content: {
                            lockupViewModel: {
                              contentId: 'aired_public_id',
                              contentImage: {
                                thumbnailViewModel: {
                                  overlays: [
                                    {
                                      thumbnailBottomOverlayViewModel: {
                                        badges: [{ thumbnailBadgeViewModel: { text: '10:00' } }],
                                      },
                                    },
                                  ],
                                },
                              },
                              metadata: {
                                lockupMetadataViewModel: {
                                  title: { content: 'Aired Public Video' },
                                  metadata: {
                                    contentMetadataViewModel: {
                                      metadataRows: [
                                        {
                                          metadataParts: [{ text: { content: '2 hours ago' } }],
                                        },
                                      ],
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };
    const html = [
      '<html><head>',
      '<link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv">',
      '<meta property="og:title" content="Test Channel">',
      '<meta property="og:image" content="https://logo.example/x.jpg">',
      '</head><body>',
      `<script>var ytInitialData = ${JSON.stringify(data)};</script>`,
      '</body></html>',
    ].join('');
    globalThis.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          text: async () => html,
        }) as Response
    );

    const scraped = await scrapeChannel('https://www.youtube.com/@test');

    expect(scraped.videos.map((v) => v.videoId)).toEqual(['aired_public_id']);
    expect(scraped.memberOnlyVideoIds).toEqual(['members_only_id']);
    expect(scraped.upcomingVideoIds).toEqual([]);
  });

  it('skips members-only videos (legacy videoRenderer BADGE_STYLE_TYPE_MEMBERS_ONLY)', async () => {
    const html = buildHtml([
      videoRenderer({ videoId: 'aired_vid' }),
      videoRenderer({
        videoId: 'members_vid',
        badges: [
          {
            metadataBadgeRenderer: {
              style: 'BADGE_STYLE_TYPE_MEMBERS_ONLY',
              label: 'Members only',
            },
          },
        ],
      }),
    ]);
    globalThis.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          text: async () => html,
        }) as Response
    );

    const scraped = await scrapeChannel('https://www.youtube.com/@test');

    expect(scraped.videos.map((v) => v.videoId)).toEqual(['aired_vid']);
    expect(scraped.memberOnlyVideoIds).toEqual(['members_vid']);
  });
});

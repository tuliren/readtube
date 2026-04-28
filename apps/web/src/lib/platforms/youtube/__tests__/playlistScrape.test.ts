import { scrapePlaylist } from '../playlistScrape';

const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  (global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
});

function buildHtml(ytInitialData: unknown): string {
  return `<html><head></head><body><script>var ytInitialData = ${JSON.stringify(
    ytInitialData
  )};</script></body></html>`;
}

function buildPlaylistData({
  alerts,
  title = 'Playlist Title',
  videos = [{ videoId: 'vid1', title: 'Video One' }],
}: {
  alerts?: unknown[];
  title?: string;
  videos?: { videoId: string; title: string }[];
}): unknown {
  return {
    ...(alerts != null ? { alerts } : {}),
    metadata: { playlistMetadataRenderer: { title } },
    sidebar: {
      playlistSidebarRenderer: {
        items: [
          {},
          {
            playlistSidebarSecondaryInfoRenderer: {
              videoOwner: {
                videoOwnerRenderer: {
                  navigationEndpoint: { browseEndpoint: { browseId: 'UC_owner' } },
                  title: { runs: [{ text: 'Owner Channel' }] },
                },
              },
            },
          },
        ],
      },
    },
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      itemSectionRenderer: {
                        contents: [
                          {
                            playlistVideoListRenderer: {
                              contents: videos.map((v) => ({
                                playlistVideoRenderer: {
                                  videoId: v.videoId,
                                  title: { runs: [{ text: v.title }] },
                                },
                              })),
                            },
                          },
                        ],
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
}

describe('scrapePlaylist', () => {
  it('parses a playlist with no alerts', async () => {
    mockFetch.mockResolvedValueOnce(new Response(buildHtml(buildPlaylistData({}))));
    const result = await scrapePlaylist('PL_test');
    expect(result.title).toBe('Playlist Title');
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe('vid1');
  });

  it('ignores INFO alerts and parses normally', async () => {
    const data = buildPlaylistData({
      alerts: [
        {
          alertWithButtonRenderer: {
            type: 'INFO',
            text: { simpleText: '4 unavailable videos are hidden' },
          },
        },
      ],
    });
    mockFetch.mockResolvedValueOnce(new Response(buildHtml(data)));
    const result = await scrapePlaylist('PL_test');
    expect(result.videos).toHaveLength(1);
  });

  it('throws PrivatePlaylistError on non-INFO alerts', async () => {
    const data = buildPlaylistData({
      alerts: [
        {
          alertRenderer: {
            type: 'ERROR',
            text: { simpleText: 'This playlist type is unviewable.' },
          },
        },
      ],
    });
    mockFetch.mockResolvedValue(new Response(buildHtml(data)));
    await expect(scrapePlaylist('PL_test')).rejects.toMatchObject({
      name: 'PrivatePlaylistError',
    });
  });

  it('skips scheduled livestream entries with upcomingEventData', async () => {
    const data = {
      metadata: { playlistMetadataRenderer: { title: 'Playlist Title' } },
      sidebar: { playlistSidebarRenderer: { items: [{}, {}] } },
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        itemSectionRenderer: {
                          contents: [
                            {
                              playlistVideoListRenderer: {
                                contents: [
                                  {
                                    playlistVideoRenderer: {
                                      videoId: 'aired_video',
                                      title: { runs: [{ text: 'Aired' }] },
                                    },
                                  },
                                  {
                                    playlistVideoRenderer: {
                                      videoId: 'upcoming_video',
                                      title: { runs: [{ text: 'Upcoming Stream' }] },
                                      upcomingEventData: {
                                        startTime: '9999999999',
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                          ],
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
    mockFetch.mockResolvedValueOnce(new Response(buildHtml(data)));
    const result = await scrapePlaylist('PL_test');
    expect(result.videos.map((v) => v.videoId)).toEqual(['aired_video']);
  });

  it('throws PrivatePlaylistError when an ERROR alert appears alongside an INFO alert', async () => {
    const data = buildPlaylistData({
      alerts: [
        {
          alertWithButtonRenderer: {
            type: 'INFO',
            text: { simpleText: '2 unavailable videos are hidden' },
          },
        },
        {
          alertRenderer: {
            type: 'ERROR',
            text: { simpleText: 'This playlist is private.' },
          },
        },
      ],
    });
    mockFetch.mockResolvedValue(new Response(buildHtml(data)));
    await expect(scrapePlaylist('PL_test')).rejects.toMatchObject({
      name: 'PrivatePlaylistError',
    });
  });
});

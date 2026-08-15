import '@tests/integration-tests';
import { NextRequest } from 'next/server';

import { GET as searchGet } from '@/app/api/search/route';
import type { SearchResponse } from '@/lib/search/types';

// Route handlers import the `prisma` singleton from `@readtube/database`
// at module load — which happens before `beforeAll` instantiates
// `global.testPrisma` against the testcontainer URL. Wrap the module
// in a Proxy so each `prisma` property access resolves to the current
// testPrisma at call time. The variable name starts with `mock` to
// satisfy jest.mock's factory hoisting rule.
const mockGetTestPrisma = () => (global as unknown as { testPrisma: unknown }).testPrisma;

jest.mock('@readtube/database', () => {
  const actual = jest.requireActual('@readtube/database');
  return new Proxy(actual, {
    get(target, prop) {
      if (prop === 'prisma') {
        return mockGetTestPrisma();
      }
      return Reflect.get(target, prop);
    },
  });
});

// The route authenticates through Clerk; stand in a fixed user id so
// the scoping subqueries (subscriptions / standalone / playlists) run
// against seeded rows.
const USER_ID = 'search-test-user';
jest.mock('@/lib/auth', () => ({
  requireUserId: () => Promise.resolve(USER_ID),
}));

async function seedUser() {
  await global.testPrisma.user.create({
    data: {
      source_id: USER_ID,
      name: 'Search Tester',
      email: 'search-tester@example.com',
    },
  });
}

async function seedChannel(sourceId: string, name: string, options?: { subscribed?: boolean }) {
  const channel = await global.testPrisma.channel.create({
    data: {
      source_id: sourceId,
      name,
      rss_url: `https://example.com/${sourceId}.xml`,
    },
  });
  if (options?.subscribed !== false) {
    await global.testPrisma.userSubscription.create({
      data: { user_id: USER_ID, channel_id: channel.id },
    });
  }
  return channel;
}

async function seedVideo(channelId: string, sourceId: string, title: string, description?: string) {
  return global.testPrisma.video.create({
    data: {
      channel_id: channelId,
      source_id: sourceId,
      title,
      description,
      published_at: new Date('2026-01-01T00:00:00Z'),
    },
  });
}

function buildRequest(q: string | null): NextRequest {
  const params = new URLSearchParams();
  if (q != null) {
    params.set('q', q);
  }
  return new NextRequest(`http://test/api/search?${params.toString()}`);
}

async function search(q: string | null): Promise<SearchResponse> {
  const response = await searchGet(buildRequest(q));
  expect(response.status).toBe(200);
  return response.json();
}

beforeEach(async () => {
  await global.testPrisma.playlistVideo.deleteMany();
  await global.testPrisma.playlist.deleteMany();
  await global.testPrisma.standaloneVideo.deleteMany();
  await global.testPrisma.userSubscription.deleteMany();
  await global.testPrisma.video.deleteMany();
  await global.testPrisma.channel.deleteMany();
  await global.testPrisma.user.deleteMany();
  await seedUser();
});

describe('GET /api/search', () => {
  it('returns empty sections for an empty query', async () => {
    const body = await search(null);
    expect(body).toEqual({ channels: [], videos: [] });
  });

  it('matches videos by title through the tsvector index, scoped to subscriptions', async () => {
    const subscribed = await seedChannel('sub-channel', 'Subscribed Channel');
    const unsubscribed = await seedChannel('other-channel', 'Other Channel', {
      subscribed: false,
    });
    await seedVideo(subscribed.id, 'v1', 'Rust ownership explained');
    await seedVideo(subscribed.id, 'v2', 'Cooking pasta at home');
    await seedVideo(unsubscribed.id, 'v3', 'Rust for embedded systems');

    const body = await search('rust');
    expect(body.videos.map((v) => v.sourceId)).toEqual(['v1']);
    expect(body.videos[0].channelName).toBe('Subscribed Channel');
    expect(body.videos[0].matchedBy).toBe('title');
    expect(body.videos[0].titleHighlight).toBe('[[Rust]] ownership explained');
    expect(body.videos[0].descriptionSnippet).toBeNull();
  });

  it('matches videos by description with English stemming and returns a delimited snippet', async () => {
    const channel = await seedChannel('c1', 'Channel One');
    await seedVideo(channel.id, 'v1', 'Weekly recap', 'Deep dive into running marathons');

    const body = await search('run marathon');
    expect(body.videos.map((v) => v.sourceId)).toEqual(['v1']);
    expect(body.videos[0].matchedBy).toBe('description');
    expect(body.videos[0].descriptionSnippet).toContain('[[running]]');
    expect(body.videos[0].descriptionSnippet).toContain('[[marathons]]');
  });

  it('classifies title and description matches into separate classes', async () => {
    const channel = await seedChannel('c1', 'Channel One');
    await seedVideo(channel.id, 'v-title', 'Docker networking deep dive');
    await seedVideo(channel.id, 'v-desc', 'Weekly recap', 'This episode covers Docker news');

    const body = await search('docker');
    const byId = new Map(body.videos.map((v) => [v.sourceId, v.matchedBy]));
    expect(byId.get('v-title')).toBe('title');
    expect(byId.get('v-desc')).toBe('description');
    // Title matches order before description matches.
    expect(body.videos.map((v) => v.sourceId)).toEqual(['v-title', 'v-desc']);
  });

  it('includes standalone and playlist videos outside subscribed channels', async () => {
    const shadow = await seedChannel('shadow', 'Shadow Channel', { subscribed: false });
    const standalone = await seedVideo(shadow.id, 'v-standalone', 'Kubernetes networking guide');
    const inPlaylist = await seedVideo(shadow.id, 'v-playlist', 'Kubernetes storage guide');
    await seedVideo(shadow.id, 'v-unreachable', 'Kubernetes security guide');
    await global.testPrisma.standaloneVideo.create({
      data: { user_id: USER_ID, video_id: standalone.id },
    });
    const playlist = await global.testPrisma.playlist.create({
      data: { user_id: USER_ID, source_id: 'pl1', name: 'K8s' },
    });
    await global.testPrisma.playlistVideo.create({
      data: { playlist_id: playlist.id, video_id: inPlaylist.id },
    });

    const body = await search('kubernetes');
    expect(body.videos.map((v) => v.sourceId).sort()).toEqual(['v-playlist', 'v-standalone']);
  });

  it('matches subscribed channels by name and handle, ranked by match position', async () => {
    await seedChannel('c-fireship', 'Fireship');
    await seedChannel('c-campfire', 'Campfire Stories');
    const handleOnly = await seedChannel('c-handle', 'Totally Different Name');
    await global.testPrisma.channel.update({
      where: { id: handleOnly.id },
      data: { handle: '@fireplace' },
    });
    await seedChannel('c-unrelated', 'MKBHD');
    await seedChannel('c-unsub-fire', 'Fire Brigade', { subscribed: false });

    const body = await search('fire');
    expect(body.channels.map((c) => c.name)).toEqual([
      'Fireship',
      'Totally Different Name',
      'Campfire Stories',
    ]);
  });

  it('caps each match class at its limit independently', async () => {
    const channel = await seedChannel('c1', 'Channel One');
    for (let i = 0; i < 12; i++) {
      await seedVideo(channel.id, `vt${i}`, `TypeScript tip number ${i}`);
    }
    for (let i = 0; i < 12; i++) {
      await seedVideo(channel.id, `vd${i}`, `Untitled episode ${i}`, `More TypeScript talk ${i}`);
    }

    const body = await search('typescript');
    expect(body.videos.filter((v) => v.matchedBy === 'title')).toHaveLength(8);
    expect(body.videos.filter((v) => v.matchedBy === 'description')).toHaveLength(8);
  });
});

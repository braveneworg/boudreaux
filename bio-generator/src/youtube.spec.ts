/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { findYoutubeReleaseDate, scoreYoutubeCandidate } from './youtube.js';

const { logEvent } = vi.hoisted(() => ({ logEvent: vi.fn() }));

vi.mock('./lib/log.js', () => ({
  logEvent,
  toErrorMessage: (err: unknown) => String(err),
}));

beforeEach(() => {
  logEvent.mockClear();
});

interface Item {
  title: string;
  channelTitle: string;
  publishedAt: string;
  videoId: string;
}

const searchResponse = (items: Item[]): Response =>
  new Response(
    JSON.stringify({
      items: items.map(({ title, channelTitle, publishedAt, videoId }) => ({
        id: { videoId },
        snippet: { title, channelTitle, publishedAt },
      })),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

const official: Item = {
  title: 'Ceschi - My Bad (Animated Video)',
  channelTitle: 'fakefourinc',
  publishedAt: '2019-08-04T15:00:00Z',
  videoId: 'duxo_G6pgPw',
};

const target = { title: 'My Bad', artist: 'Ceschi' };

describe('scoreYoutubeCandidate', () => {
  it('rejects a candidate whose title does not carry the song title', () => {
    const score = scoreYoutubeCandidate(
      { title: 'Ceschi - Middle Earth', channelTitle: 'fakefourinc' },
      target
    );

    expect(score).toBe(0);
  });

  it('scores an artist+title match above a title-only match', () => {
    const both = scoreYoutubeCandidate(
      { title: 'Ceschi - My Bad', channelTitle: 'somebody' },
      target
    );
    const titleOnly = scoreYoutubeCandidate(
      { title: 'My Bad (fan edit)', channelTitle: 'somebody' },
      target
    );

    expect(both).toBeGreaterThan(titleOnly);
  });

  it('still accepts a title-only match', () => {
    const score = scoreYoutubeCandidate(
      { title: 'My Bad (fan edit)', channelTitle: 'somebody' },
      target
    );

    expect(score).toBeGreaterThan(0);
  });

  it('ignores bracketed decorations when matching the title', () => {
    const score = scoreYoutubeCandidate(
      { title: 'Ceschi - My Bad [HD] (Official Music Video)', channelTitle: 'fakefourinc' },
      target
    );

    expect(score).toBeGreaterThan(0);
  });

  it('credits a channel that carries the artist name', () => {
    const withChannel = scoreYoutubeCandidate(
      { title: 'My Bad', channelTitle: 'Ceschi Official' },
      target
    );
    const withoutChannel = scoreYoutubeCandidate(
      { title: 'My Bad', channelTitle: 'somebody' },
      target
    );

    expect(withChannel).toBeGreaterThan(withoutChannel);
  });
});

describe('findYoutubeReleaseDate', () => {
  it('returns the premiere date as a YYYY-MM-DD day', async () => {
    const fetchFn = vi.fn().mockResolvedValue(searchResponse([official]));

    const match = await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    expect(match?.releasedOn).toBe('2019-08-04');
  });

  it('cites the matched video as its source url', async () => {
    const fetchFn = vi.fn().mockResolvedValue(searchResponse([official]));

    const match = await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    expect(match?.url).toBe('https://www.youtube.com/watch?v=duxo_G6pgPw');
  });

  it('reports high confidence when the video title carries artist and title', async () => {
    const fetchFn = vi.fn().mockResolvedValue(searchResponse([official]));

    const match = await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    expect(match?.confidence).toBe('high');
  });

  it('reports medium confidence for a title-only match', async () => {
    const weak: Item = { ...official, title: 'My Bad (fan edit)', channelTitle: 'somebody' };
    const fetchFn = vi.fn().mockResolvedValue(searchResponse([weak]));

    const match = await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    expect(match?.confidence).toBe('medium');
  });

  it('prefers the earliest premiere among equally strong matches', async () => {
    const reupload: Item = {
      ...official,
      publishedAt: '2021-01-01T00:00:00Z',
      videoId: 'later',
    };
    const fetchFn = vi.fn().mockResolvedValue(searchResponse([reupload, official]));

    const match = await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    expect(match?.releasedOn).toBe('2019-08-04');
  });

  it('returns null when the search yields no items', async () => {
    const fetchFn = vi.fn().mockResolvedValue(searchResponse([]));

    const match = await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    expect(match).toBeNull();
  });

  it('returns null when nothing matches the song title', async () => {
    const unrelated: Item = { ...official, title: 'Ceschi - Middle Earth' };
    const fetchFn = vi.fn().mockResolvedValue(searchResponse([unrelated]));

    const match = await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    expect(match).toBeNull();
  });

  it('degrades to null on a non-ok response rather than throwing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('quota', { status: 403 }));

    const match = await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    expect(match).toBeNull();
  });

  it('logs the reason Google rejected the request, not just the status', async () => {
    // A rejected key answers 400 keyInvalid; without the reason this is
    // indistinguishable in the logs from "the search found nothing".
    const body = JSON.stringify({
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        errors: [{ reason: 'keyInvalid' }],
      },
    });
    const fetchFn = vi.fn().mockResolvedValue(new Response(body, { status: 400 }));

    await findYoutubeReleaseDate({ ...target, apiKey: 'bad-key' }, fetchFn);

    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'youtube_search_failed',
      expect.objectContaining({ status: 400, reason: 'keyInvalid' })
    );
  });

  it('still logs a status when the error body is not parseable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('<html>nope</html>', { status: 503 }));

    await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'youtube_search_failed',
      expect.objectContaining({ status: 503 })
    );
  });

  it('degrades to null when the fetch rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'));

    const match = await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    expect(match).toBeNull();
  });

  it('searches the YouTube data API with the artist and title', async () => {
    const fetchFn = vi.fn().mockResolvedValue(searchResponse([official]));

    await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain('https://www.googleapis.com/youtube/v3/search');
  });

  it('authenticates with the api key as a query parameter', async () => {
    const fetchFn = vi.fn().mockResolvedValue(searchResponse([official]));

    await findYoutubeReleaseDate({ ...target, apiKey: 'yt-key' }, fetchFn);

    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain('key=yt-key');
  });
});

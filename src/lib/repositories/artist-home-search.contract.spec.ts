/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import type { ArtistHomeSearchMatch } from '@/lib/types/domain/artist';

import { ArtistRepository } from './artist-repository';

// Contract: on a real MongoDB, the home search finds the public artists with
// a direct credit on a playable listed release (a non-withdrawn MP3 320 format
// holding a file) or a video credit on a live video, and a matched artist
// lists only its playable releases and its live videos. The artists index
// lists an artist with a listed release, playable or not, or a live video
// (ADR-0022); the playlist "By artist" search stays on listed releases only
// (ADR-0007). Runs only under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
// One search token every seeded artist carries, and tokens that only one
// release or video title carries. Letters and digits only, so the tokenizer
// keeps each one whole.
const stamp = randomUUID().replaceAll('-', '');
const TOKEN = `hs${stamp}`;
const VIDEO_TITLE_TOKEN = `vt${stamp}`;
const UNPLAYABLE_TITLE_TOKEN = `ut${stamp}`;
const BOTH_VIDEO_TOKEN = `bv${stamp}`;

const PAST = new Date('2026-01-01T00:00:00.000Z');
const OLDER = new Date('2025-01-01T00:00:00.000Z');
const FUTURE = new Date('2100-01-01T00:00:00.000Z');

const slugOf = (label: string): string => `${prefix}${label}`;

type FormatSpec = { formatType: string; withdrawn?: boolean; files: number };

const createArtist = async (label: string, publishedOn?: Date): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: {
      firstName: label,
      surname: TOKEN,
      slug: slugOf(label),
      ...(publishedOn && { publishedOn }),
    },
    select: { id: true },
  });
  return id;
};

/** A release credited to one artist, with the given formats and file counts. */
const createRelease = async (
  label: string,
  artistId: string,
  formats: FormatSpec[],
  publishedAt: Date | null = PAST
): Promise<string> => {
  const { id } = await prisma.release.create({
    data: {
      title: `${prefix}${label}`,
      releasedOn: PAST,
      coverArt: 'https://cdn.example.com/contract.webp',
      ...(publishedAt && { publishedAt }),
    },
    select: { id: true },
  });
  await prisma.artistRelease.create({ data: { artistId, releaseId: id, position: 0 } });
  for (const { formatType, withdrawn, files } of formats) {
    const format = await prisma.releaseDigitalFormat.create({
      data: { releaseId: id, formatType, ...(withdrawn && { deletedAt: PAST }) },
      select: { id: true },
    });
    for (let trackNumber = files; trackNumber >= 1; trackNumber -= 1) {
      await prisma.releaseDigitalFormatFile.create({
        data: {
          formatId: format.id,
          trackNumber,
          s3Key: `${prefix}${label}/${trackNumber}.mp3`,
          fileName: `${trackNumber}.mp3`,
          fileSize: BigInt(1),
          mimeType: 'audio/mpeg',
        },
      });
    }
  }
  return id;
};

const MP3 = (files = 1): FormatSpec => ({ formatType: 'MP3_320KBPS', files });

/** A video credited to one artist. */
const createVideo = async (
  title: string,
  artistId: string,
  state: { publishedAt?: Date; archivedAt?: Date; releasedOn?: Date }
): Promise<string> => {
  const { id } = await prisma.video.create({
    data: {
      title,
      artist: 'contract',
      category: 'MUSIC',
      s3Key: `contract/${randomUUID()}.mp4`,
      fileName: 'contract.mp4',
      mimeType: 'video/mp4',
      ...state,
    },
    select: { id: true },
  });
  await prisma.videoArtist.create({ data: { videoId: id, artistId } });
  return id;
};

const ids = {
  playableRelease: '',
  unplayableRelease: '',
  bothRelease: '',
  newerVideo: '',
  olderVideo: '',
  bothVideo: '',
};

const ours = (matches: Array<{ slug: string }>): string[] =>
  matches
    .map(({ slug }) => slug)
    .filter((slug) => slug.startsWith(prefix))
    .map((slug) => slug.slice(prefix.length))
    .sort();

const homeSearch = async (search: string): Promise<ArtistHomeSearchMatch[]> =>
  (await ArtistRepository.searchForHomeNav({ search, take: 100 })).filter(({ slug }) =>
    slug.startsWith(prefix)
  );

const matchFor = async (label: string): Promise<ArtistHomeSearchMatch | undefined> =>
  (await homeSearch(TOKEN)).find(({ slug }) => slug === slugOf(label));

// Every row is seeded here, serially: the tests run shuffled, and concurrent
// creates race the read-back on a fresh collection.
beforeAll(async () => {
  const playable = await createArtist('playable', PAST);
  ids.playableRelease = await createRelease('playable', playable, [MP3()]);
  ids.unplayableRelease = await createRelease(`flac-${UNPLAYABLE_TITLE_TOKEN}`, playable, [
    { formatType: 'FLAC', files: 1 },
  ]);

  const videoOnly = await createArtist('video-only', PAST);
  ids.olderVideo = await createVideo(`${prefix}older ${VIDEO_TITLE_TOKEN}`, videoOnly, {
    publishedAt: PAST,
    releasedOn: OLDER,
  });
  ids.newerVideo = await createVideo(`${prefix}newer`, videoOnly, {
    publishedAt: PAST,
    releasedOn: PAST,
  });

  const both = await createArtist('both', PAST);
  ids.bothRelease = await createRelease('both', both, [MP3(2)]);
  ids.bothVideo = await createVideo(`${prefix}both ${BOTH_VIDEO_TOKEN}`, both, {
    publishedAt: PAST,
    releasedOn: PAST,
  });
  await createVideo(`${prefix}both-scheduled`, both, { publishedAt: FUTURE, releasedOn: PAST });

  const withdrawn = await createArtist('withdrawn-mp3', PAST);
  await createRelease('withdrawn-mp3', withdrawn, [{ ...MP3(), withdrawn: true }]);

  const noFiles = await createArtist('mp3-no-files', PAST);
  await createRelease('mp3-no-files', noFiles, [MP3(0)]);

  const flacOnly = await createArtist('flac-only', PAST);
  await createRelease('flac-only', flacOnly, [{ formatType: 'FLAC', files: 1 }]);

  const draft = await createArtist('draft-release', PAST);
  await createRelease('draft-release', draft, [MP3()], null);

  const scheduled = await createArtist('scheduled-video', PAST);
  await createVideo(`${prefix}scheduled`, scheduled, { publishedAt: FUTURE, releasedOn: PAST });

  const archived = await createArtist('archived-video', PAST);
  await createVideo(`${prefix}archived`, archived, {
    publishedAt: PAST,
    archivedAt: PAST,
    releasedOn: PAST,
  });

  const hidden = await createArtist('hidden-with-video');
  await createVideo(`${prefix}hidden ${VIDEO_TITLE_TOKEN}`, hidden, {
    publishedAt: PAST,
    releasedOn: PAST,
  });
});

afterAll(async () => {
  const artists = await prisma.artist.findMany({
    where: { slug: { startsWith: prefix } },
    select: { id: true },
  });
  const artistIds = artists.map(({ id }) => id);
  const releases = await prisma.release.findMany({
    where: { title: { startsWith: prefix } },
    select: { id: true },
  });
  const releaseIds = releases.map(({ id }) => id);
  const formats = await prisma.releaseDigitalFormat.findMany({
    where: { releaseId: { in: releaseIds } },
    select: { id: true },
  });
  const formatIds = formats.map(({ id }) => id);
  await prisma.videoArtist.deleteMany({ where: { artistId: { in: artistIds } } });
  await prisma.video.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.releaseDigitalFormatFile.deleteMany({ where: { formatId: { in: formatIds } } });
  await prisma.releaseDigitalFormat.deleteMany({ where: { id: { in: formatIds } } });
  await prisma.artistRelease.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  await prisma.$disconnect();
});

describe('home search (Docker Mongo contract)', () => {
  it('finds the playable-release, video-only and both artists, and nobody else', async () => {
    expect(ours(await homeSearch(TOKEN))).toEqual(['both', 'playable', 'video-only']);
  });

  it('lists a playable release, and never an unplayable one, under its artist', async () => {
    const playable = await matchFor('playable');

    expect(playable?.releases.map(({ release }) => release.id)).toEqual([ids.playableRelease]);
    expect(playable?.videoArtists).toEqual([]);
  });

  it("loads the playable format's first file only", async () => {
    const both = await matchFor('both');

    expect(both?.releases.map(({ release }) => release.digitalFormats)).toEqual([
      [{ files: [{ s3Key: `${prefix}both/1.mp3` }] }],
    ]);
  });

  it('lists every live video of a video-only artist, newest first', async () => {
    const videoOnly = await matchFor('video-only');

    expect(videoOnly?.releases).toEqual([]);
    expect(videoOnly?.videoArtists.map(({ video }) => video.id)).toEqual([
      ids.newerVideo,
      ids.olderVideo,
    ]);
  });

  it('lists the playable release and the live video, not the scheduled one, of both', async () => {
    const both = await matchFor('both');

    expect(both?.releases.map(({ release }) => release.id)).toEqual([ids.bothRelease]);
    expect(both?.videoArtists.map(({ video }) => video.id)).toEqual([ids.bothVideo]);
  });

  it.each([
    'withdrawn-mp3',
    'mp3-no-files',
    'flac-only',
    'draft-release',
    'scheduled-video',
    'archived-video',
    'hidden-with-video',
  ])('leaves out the %s artist', async (label) => {
    expect(ours(await homeSearch(TOKEN))).not.toContain(label);
  });

  it('finds an artist by the title of a live video, never a hidden artist', async () => {
    expect(ours(await homeSearch(VIDEO_TITLE_TOKEN))).toEqual(['video-only']);
  });

  it('finds an artist by the title of an unplayable release, without listing it', async () => {
    const matches = await homeSearch(UNPLAYABLE_TITLE_TOKEN);

    expect(ours(matches)).toEqual(['playable']);
    expect(matches[0]?.releases.map(({ release }) => release.id)).toEqual([ids.playableRelease]);
  });

  it('lets each token of a search match a different field', async () => {
    expect(ours(await homeSearch(`both ${BOTH_VIDEO_TOKEN}`))).toEqual(['both']);
    expect(ours(await homeSearch(`playable ${BOTH_VIDEO_TOKEN}`))).toEqual([]);
  });

  it('keeps the video-only artist out of the playlist search', async () => {
    const searched = await ArtistRepository.searchPublished({ search: TOKEN, take: 100 });

    // Every artist with a listed release, playable or not, and nobody else.
    expect(ours(searched)).toEqual([
      'both',
      'flac-only',
      'mp3-no-files',
      'playable',
      'withdrawn-mp3',
    ]);
  });

  it('lists the artists with a listed release or a live video on the artists index', async () => {
    const listed = await ArtistRepository.listListed({
      search: TOKEN,
      sort: 'alpha',
      skip: 0,
      take: 100,
    });

    // A draft release, a scheduled or archived video, or a hidden artist lists nobody.
    expect(ours(listed)).toEqual([
      'both',
      'flac-only',
      'mp3-no-files',
      'playable',
      'video-only',
      'withdrawn-mp3',
    ]);
  });

  it('reads only the live videos an artist index row ranks by', async () => {
    const listed = await ArtistRepository.listListed({
      search: TOKEN,
      sort: 'newest',
      skip: 0,
      take: 100,
    });
    const videoDates = (label: string): Array<Date | null> | undefined =>
      listed
        .find(({ slug }) => slug === slugOf(label))
        ?.videoArtists.map(({ video }) => video.releasedOn);

    // `both` also holds a scheduled video, which a public read never sees.
    expect(videoDates('both')).toEqual([PAST]);
    expect(videoDates('video-only')).toHaveLength(2);
    expect(videoDates('playable')).toEqual([]);
  });

  it('finds an artist on the artists index by the title of a live video', async () => {
    const listed = await ArtistRepository.listListed({
      search: VIDEO_TITLE_TOKEN,
      sort: 'alpha',
      skip: 0,
      take: 100,
    });

    expect(ours(listed)).toEqual(['video-only']);
  });
});

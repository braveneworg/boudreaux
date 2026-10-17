/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  backfillBioReleaseLinks,
  planBioLinkRewrites,
  type BioSource,
  type ReleaseCreditSource,
} from './backfill-bio-release-links';

import type { PrismaClient } from '@prisma/client';

const OWN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const GUEST = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const HIDDEN = 'cccccccccccccccccccccccc';
const GONE = 'dddddddddddddddddddddddd';

const PUBLISHED = new Date('2024-01-01T00:00:00.000Z');
const credit = (slug: string, publishedOn: Date | null = PUBLISHED) => ({
  artist: { slug, publishedOn, deletedOn: null },
});

const releases: ReleaseCreditSource[] = [
  { id: OWN, artistReleases: [credit('e2e-artist')] },
  { id: GUEST, artistReleases: [credit('ceschi'), credit('e2e-artist')] },
  { id: HIDDEN, artistReleases: [credit('hidden', null), credit('e2e-artist')] },
];

const bio = (overrides: Partial<BioSource> = {}): BioSource => ({
  id: 'artist-1',
  slug: 'e2e-artist',
  bio: null,
  shortBio: null,
  altBio: null,
  bioLinks: [],
  ...overrides,
});

const deepLink = (slug: string, id: string): string => `/releases?artist=${slug}&release=${id}`;
const htmlDeepLink = (slug: string, id: string): string =>
  `/releases?artist=${slug}&amp;release=${id}`;

describe('planBioLinkRewrites', () => {
  it("rewrites a bio's release-page hrefs to the album artist's deep link", () => {
    const plan = planBioLinkRewrites(
      [
        bio({
          bio: `<p><a href="/releases/${OWN}">One</a> and <a href="/releases/${GUEST}">Two</a></p>`,
        }),
      ],
      releases
    );

    expect(plan.artistUpdates).toEqual([
      {
        id: 'artist-1',
        data: {
          bio: `<p><a href="${htmlDeepLink('e2e-artist', OWN)}">One</a> and <a href="${htmlDeepLink('ceschi', GUEST)}">Two</a></p>`,
        },
      },
    ]);
  });

  it('rewrites the short and promotional bios too', () => {
    const plan = planBioLinkRewrites(
      [
        bio({
          shortBio: `<a href="/releases/${OWN}">One</a>`,
          altBio: `<a href="/releases/${OWN}">One</a>`,
        }),
      ],
      releases
    );

    expect(plan.artistUpdates).toEqual([
      {
        id: 'artist-1',
        data: {
          shortBio: `<a href="${htmlDeepLink('e2e-artist', OWN)}">One</a>`,
          altBio: `<a href="${htmlDeepLink('e2e-artist', OWN)}">One</a>`,
        },
      },
    ]);
  });

  it("rewrites the bio's link-palette rows", () => {
    const plan = planBioLinkRewrites(
      [bio({ bioLinks: [{ id: 'link-1', url: `/releases/${GUEST}` }] })],
      releases
    );

    expect(plan.linkUpdates).toEqual([{ id: 'link-1', url: deepLink('ceschi', GUEST) }]);
  });

  it("falls back to the bio artist's slug when the album artist is hidden or the release is gone", () => {
    const plan = planBioLinkRewrites(
      [
        bio({
          bio: `<a href="/releases/${HIDDEN}">H</a><a href="/releases/${GONE}">G</a>`,
          bioLinks: [{ id: 'link-1', url: `/releases/${GONE}` }],
        }),
      ],
      releases
    );

    expect(plan.artistUpdates[0]?.data.bio).toBe(
      `<a href="${htmlDeepLink('e2e-artist', HIDDEN)}">H</a><a href="${htmlDeepLink('e2e-artist', GONE)}">G</a>`
    );
    expect(plan.linkUpdates).toEqual([{ id: 'link-1', url: deepLink('e2e-artist', GONE) }]);
  });

  it('is idempotent: an already-rewritten bio plans nothing', () => {
    const plan = planBioLinkRewrites(
      [
        bio({
          bio: `<a href="${htmlDeepLink('e2e-artist', OWN)}">One</a>`,
          bioLinks: [{ id: 'link-1', url: deepLink('e2e-artist', OWN) }],
        }),
      ],
      releases
    );

    expect(plan).toEqual({ artistUpdates: [], linkUpdates: [], linkDeletes: [] });
  });

  it('leaves other links alone', () => {
    const plan = planBioLinkRewrites(
      [
        bio({
          bio: '<a href="https://en.wikipedia.org/wiki/X">W</a><a href="/releases?artist=e2e-artist">All</a>',
          bioLinks: [{ id: 'link-1', url: 'https://en.wikipedia.org/wiki/X' }],
        }),
      ],
      releases
    );

    expect(plan).toEqual({ artistUpdates: [], linkUpdates: [], linkDeletes: [] });
  });

  it('drops a legacy palette row whose deep link the artist already holds', () => {
    const plan = planBioLinkRewrites(
      [
        bio({
          bioLinks: [
            { id: 'legacy', url: `/releases/${OWN}` },
            { id: 'current', url: deepLink('e2e-artist', OWN) },
          ],
        }),
      ],
      releases
    );

    expect(plan.linkUpdates).toEqual([]);
    expect(plan.linkDeletes).toEqual(['legacy']);
  });
});

describe('backfillBioReleaseLinks', () => {
  const bios = [
    bio({
      bio: `<a href="/releases/${OWN}">One</a>`,
      bioLinks: [{ id: 'link-1', url: `/releases/${OWN}` }],
    }),
  ];

  const makePrisma = () => {
    const artistFindMany = vi.fn().mockResolvedValue(bios);
    const releaseFindMany = vi.fn().mockResolvedValue(releases);
    const artistUpdate = vi.fn().mockImplementation((args: unknown) => Promise.resolve(args));
    const linkUpdate = vi.fn().mockImplementation((args: unknown) => Promise.resolve(args));
    const linkDelete = vi.fn().mockImplementation((args: unknown) => Promise.resolve(args));
    const $transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
    return {
      prisma: {
        artist: { findMany: artistFindMany, update: artistUpdate },
        release: { findMany: releaseFindMany },
        artistBioLink: { update: linkUpdate, delete: linkDelete },
        $transaction,
      } as unknown as PrismaClient,
      artistUpdate,
      linkUpdate,
      $transaction,
    };
  };

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27018/spec?replicaSet=rs0');
  });

  it('refuses to run without DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', '');

    await expect(backfillBioReleaseLinks([], { prisma: makePrisma().prisma })).rejects.toThrow(
      /DATABASE_URL/
    );
  });

  it('only reports on a dry run', async () => {
    const { prisma, artistUpdate, linkUpdate, $transaction } = makePrisma();
    const log = vi.fn();

    await backfillBioReleaseLinks([], { prisma, log });

    expect(artistUpdate).not.toHaveBeenCalled();
    expect(linkUpdate).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toMatch(/1 bio\(s\) and 1 palette link\(s\)/);
    expect(log.mock.calls.flat().join('\n')).toMatch(/--execute/);
  });

  it('writes the planned rewrites in one transaction with --execute', async () => {
    const { prisma, artistUpdate, linkUpdate, $transaction } = makePrisma();

    await backfillBioReleaseLinks(['--execute'], { prisma, log: vi.fn() });

    expect(artistUpdate.mock.calls).toEqual([
      [
        {
          where: { id: 'artist-1' },
          data: { bio: `<a href="${htmlDeepLink('e2e-artist', OWN)}">One</a>` },
        },
      ],
    ]);
    expect(linkUpdate.mock.calls).toEqual([
      [{ where: { id: 'link-1' }, data: { url: deepLink('e2e-artist', OWN) } }],
    ]);
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it('writes nothing with --execute when every link is already a deep link', async () => {
    const { prisma, artistUpdate, $transaction } = makePrisma();
    vi.mocked(prisma.artist.findMany).mockResolvedValueOnce([bio()] as never);

    await backfillBioReleaseLinks(['--execute'], { prisma, log: vi.fn() });

    expect(artistUpdate).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });
});

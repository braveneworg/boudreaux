/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CreditDecisionError } from '@/lib/types/domain/errors';

import { artistWhere } from './artist-where';
import {
  addCredits,
  publishConfirmedCredits,
  syncCredits,
  type CreditClient,
} from './release-credits';

const NOW = new Date('2026-10-04T12:00:00.000Z');

const AWAITING_GATE = [artistWhere.unpublished, artistWhere.notDeleted];

/** A transaction client: every write in these helpers must go through it. */
const buildClient = () => ({
  artist: {
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  artistRelease: {
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    upsert: vi.fn().mockResolvedValue({}),
  },
});

const asClient = (client: ReturnType<typeof buildClient>): CreditClient =>
  client as unknown as CreditClient;

const awaitingRow = (id: string, displayName: string) => ({
  id,
  slug: id,
  displayName,
  firstName: null,
  middleName: null,
  surname: null,
  title: null,
  suffix: null,
  bio: null,
  shortBio: null,
  altBio: null,
  bioGeneratedAt: null,
  bioImages: [],
});

describe('release credits', () => {
  let client: ReturnType<typeof buildClient>;

  beforeEach(() => {
    client = buildClient();
  });

  describe('addCredits', () => {
    it('creates one credit row per artist in the given order', async () => {
      await addCredits(asClient(client), 'release-1', ['artist-b', 'artist-a']);

      expect(client.artistRelease.createMany.mock.calls).toEqual([
        [
          {
            data: [
              { artistId: 'artist-b', releaseId: 'release-1', position: 0 },
              { artistId: 'artist-a', releaseId: 'release-1', position: 1 },
            ],
          },
        ],
      ]);
    });

    it('writes nothing for an empty artist list', async () => {
      await addCredits(asClient(client), 'release-1', []);

      expect(client.artistRelease.createMany.mock.calls).toEqual([]);
    });
  });

  describe('syncCredits', () => {
    // The list's order is the credit order: every wanted credit is upserted
    // with its index as position, so moving an artist to the front makes it
    // the album artist, and credits no longer listed are dropped.
    it('drops unlisted credits and stamps each listed one with its position', async () => {
      client.artistRelease.findMany.mockResolvedValueOnce([
        { id: 'row-a', artistId: 'artist-a' },
        { id: 'row-b', artistId: 'artist-b' },
      ]);

      await syncCredits(asClient(client), 'release-1', ['artist-c', 'artist-b']);

      expect({
        deleted: client.artistRelease.deleteMany.mock.calls,
        upserted: client.artistRelease.upsert.mock.calls,
      }).toEqual({
        deleted: [[{ where: { id: { in: ['row-a'] } } }]],
        upserted: [
          [
            {
              where: { artistId_releaseId: { artistId: 'artist-c', releaseId: 'release-1' } },
              create: { artistId: 'artist-c', releaseId: 'release-1', position: 0 },
              update: { position: 0 },
            },
          ],
          [
            {
              where: { artistId_releaseId: { artistId: 'artist-b', releaseId: 'release-1' } },
              create: { artistId: 'artist-b', releaseId: 'release-1', position: 1 },
              update: { position: 1 },
            },
          ],
        ],
      });
    });

    it('re-stamps positions even when the set of credits already matches', async () => {
      client.artistRelease.findMany.mockResolvedValueOnce([
        { id: 'row-a', artistId: 'artist-a' },
        { id: 'row-b', artistId: 'artist-b' },
      ]);

      await syncCredits(asClient(client), 'release-1', ['artist-b', 'artist-a']);

      expect({
        deleted: client.artistRelease.deleteMany.mock.calls,
        stamped: client.artistRelease.upsert.mock.calls.map(([arg]) => [
          arg.create.artistId,
          arg.update.position,
        ]),
      }).toEqual({
        deleted: [],
        stamped: [
          ['artist-b', 0],
          ['artist-a', 1],
        ],
      });
    });

    it('drops every credit when the list is empty', async () => {
      client.artistRelease.findMany.mockResolvedValueOnce([{ id: 'row-a', artistId: 'artist-a' }]);

      await syncCredits(asClient(client), 'release-1', []);

      expect({
        deleted: client.artistRelease.deleteMany.mock.calls,
        upserted: client.artistRelease.upsert.mock.calls,
      }).toEqual({
        deleted: [[{ where: { id: { in: ['row-a'] } } }]],
        upserted: [],
      });
    });
  });

  describe('publishConfirmedCredits', () => {
    const publication = {
      decisions: { publishArtistIds: ['artist-1'], keepHiddenArtistIds: ['artist-2'] },
      publishedBy: 'admin-1',
      now: NOW,
    };

    it('checks the decisions against the credits the release stores', async () => {
      client.artist.findMany.mockResolvedValueOnce([awaitingRow('artist-1', 'Ada')]);

      await publishConfirmedCredits(asClient(client), 'release-1', publication);

      expect(client.artist.findMany.mock.calls[0][0].where).toEqual({
        releases: { some: { releaseId: 'release-1' } },
        AND: AWAITING_GATE,
      });
    });

    it('refuses an undecided credit, naming the artist, and publishes nothing', async () => {
      client.artist.findMany.mockResolvedValueOnce([
        awaitingRow('artist-1', 'Ada'),
        awaitingRow('artist-3', 'Bea'),
      ]);

      const write = publishConfirmedCredits(asClient(client), 'release-1', publication);

      await expect(write).rejects.toThrow(CreditDecisionError);
      await expect(write).rejects.toThrow('Bea');
      expect(client.artist.updateMany.mock.calls).toEqual([]);
    });

    it('stamps only the confirmed artists that still await confirmation', async () => {
      client.artist.findMany.mockResolvedValueOnce([awaitingRow('artist-1', 'Ada')]);

      await publishConfirmedCredits(asClient(client), 'release-1', publication);

      expect(client.artist.updateMany.mock.calls).toEqual([
        [
          {
            where: {
              id: { in: ['artist-1'] },
              releases: { some: { releaseId: 'release-1' } },
              AND: AWAITING_GATE,
            },
            data: { publishedOn: NOW, publishedBy: 'admin-1' },
          },
        ],
      ]);
    });

    it('returns the number of artists published', async () => {
      client.artist.findMany.mockResolvedValueOnce([awaitingRow('artist-1', 'Ada')]);
      client.artist.updateMany.mockResolvedValueOnce({ count: 1 });

      const count = await publishConfirmedCredits(asClient(client), 'release-1', publication);

      expect(count).toBe(1);
    });

    it('writes nothing when no artist was confirmed', async () => {
      const count = await publishConfirmedCredits(asClient(client), 'release-1', {
        ...publication,
        decisions: { publishArtistIds: [], keepHiddenArtistIds: [] },
      });

      expect({ count, calls: client.artist.updateMany.mock.calls }).toEqual({
        count: 0,
        calls: [],
      });
    });
  });
});

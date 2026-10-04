/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { CreditDecisionError, DataError } from '@/lib/types/domain/errors';
import { NO_CREDIT_DECISIONS } from '@/lib/utils/credit-confirmation';

import { creditOrderBy } from './_internal/credit-order';
import { ReleaseRepository } from './release-repository';

// Contract: a release write stores the release, its credits and the artists
// it publishes in one MongoDB transaction (ADR-0015). A failure anywhere in
// the write leaves all of them as they were: a release is never public with
// half of a save behind it. Runs only under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const NOW = new Date('2026-10-04T12:00:00.000Z');
const EARLIER = new Date('2026-01-01T00:00:00.000Z');
const ADMIN = 'contract-admin';

const artistIds: string[] = [];
const artist = { kept: '', confirmed: '', undecided: '', dropped: '' };
const release = { saved: '', refused: '' };
const outcome: Record<'saved' | 'refused' | 'created' | 'failedCreate', unknown> = {
  saved: null,
  refused: null,
  created: null,
  failedCreate: null,
};
let createdReleaseId = '';

const createArtist = async (label: string, publishedOn: Date | null): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: {
      displayName: `${prefix}${label}`,
      firstName: prefix,
      surname: label,
      slug: `${prefix}${label}`,
      publishedOn,
    },
    select: { id: true },
  });
  artistIds.push(id);
  return id;
};

const releaseData = (label: string) => ({
  title: `${prefix}${label}`,
  releasedOn: EARLIER,
  coverArt: 'https://cdn.example.com/contract.webp',
  formats: ['DIGITAL' as const],
});

const createCreditedRelease = async (label: string, credited: string[]): Promise<string> => {
  const { id } = await prisma.release.create({ data: releaseData(label), select: { id: true } });
  await prisma.artistRelease.createMany({
    data: credited.map((artistId, position) => ({ artistId, releaseId: id, position })),
  });
  return id;
};

/** Run a write and keep what it threw, or null when it went through. */
const errorOf = async (write: () => Promise<unknown>): Promise<unknown> => {
  try {
    await write();
    return null;
  } catch (error) {
    return error;
  }
};

const creditedOn = async (releaseId: string): Promise<string[]> => {
  const rows = await prisma.artistRelease.findMany({
    where: { releaseId },
    orderBy: creditOrderBy,
    select: { artistId: true },
  });
  return rows.map(({ artistId }) => artistId);
};

// Every row is seeded, and every write is run, here: the tests run shuffled
// and only read.
beforeAll(async () => {
  artist.kept = await createArtist('kept', EARLIER);
  artist.confirmed = await createArtist('confirmed', null);
  artist.undecided = await createArtist('undecided', null);
  artist.dropped = await createArtist('dropped', EARLIER);
  release.saved = await createCreditedRelease('saved', [artist.dropped]);
  release.refused = await createCreditedRelease('refused', [artist.kept]);

  outcome.saved = await errorOf(() =>
    ReleaseRepository.updateWithCredits(
      release.saved,
      { title: `${prefix}saved-renamed`, publishedAt: NOW },
      {
        artistIds: [artist.kept, artist.confirmed],
        publish: {
          decisions: { publishArtistIds: [artist.confirmed], keepHiddenArtistIds: [] },
          publishedBy: ADMIN,
          now: NOW,
        },
      }
    )
  );
  outcome.refused = await errorOf(() =>
    ReleaseRepository.updateWithCredits(
      release.refused,
      { title: `${prefix}refused-renamed`, publishedAt: NOW },
      {
        artistIds: [artist.kept, artist.undecided],
        publish: { decisions: NO_CREDIT_DECISIONS, publishedBy: ADMIN, now: NOW },
      }
    )
  );
  outcome.created = await errorOf(async () => {
    const created = await ReleaseRepository.createWithCredits(releaseData('created'), [
      artist.undecided,
      artist.kept,
    ]);
    createdReleaseId = created.id;
  });
  outcome.failedCreate = await errorOf(() =>
    ReleaseRepository.createWithCredits(releaseData('failed-create'), [
      artist.kept,
      'not-an-object-id',
    ])
  );
});

afterAll(async () => {
  const releases = await prisma.release.findMany({
    where: { title: { startsWith: prefix } },
    select: { id: true },
  });
  const releaseIds = releases.map(({ id }) => id);
  await prisma.artistRelease.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.release.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  await prisma.$disconnect();
});

describe('a release write (Docker Mongo contract)', () => {
  describe('that goes through', () => {
    it('stores the release fields', async () => {
      const stored = await prisma.release.findUniqueOrThrow({
        where: { id: release.saved },
        select: { title: true, publishedAt: true },
      });

      expect({ outcome: outcome.saved, stored }).toEqual({
        outcome: null,
        stored: { title: `${prefix}saved-renamed`, publishedAt: NOW },
      });
    });

    it('stores the credits in the order given and drops the ones no longer listed', async () => {
      expect(await creditedOn(release.saved)).toEqual([artist.kept, artist.confirmed]);
    });

    it('publishes the confirmed artist with the admin who confirmed it', async () => {
      const confirmed = await prisma.artist.findUniqueOrThrow({
        where: { id: artist.confirmed },
        select: { publishedOn: true, publishedBy: true },
      });

      expect(confirmed).toEqual({ publishedOn: NOW, publishedBy: ADMIN });
    });
  });

  describe('that is refused by the credit check', () => {
    it('fails naming the artist that needs a decision', () => {
      expect(outcome.refused).toBeInstanceOf(CreditDecisionError);
      expect((outcome.refused as Error).message).toContain(`${prefix}undecided`);
    });

    it('leaves the release fields as they were', async () => {
      const stored = await prisma.release.findUniqueOrThrow({
        where: { id: release.refused },
        select: { title: true, publishedAt: true },
      });

      expect(stored).toEqual({ title: `${prefix}refused`, publishedAt: null });
    });

    it('leaves the credits as they were', async () => {
      expect(await creditedOn(release.refused)).toEqual([artist.kept]);
    });

    it('publishes no artist', async () => {
      const undecided = await prisma.artist.findUniqueOrThrow({
        where: { id: artist.undecided },
        select: { publishedOn: true },
      });

      expect(undecided.publishedOn).toBeNull();
    });
  });

  describe('that creates a release', () => {
    it('stores its credits in the order given', async () => {
      expect({ outcome: outcome.created, credited: await creditedOn(createdReleaseId) }).toEqual({
        outcome: null,
        credited: [artist.undecided, artist.kept],
      });
    });

    it('creates nothing when storing a credit fails', async () => {
      const stored = await prisma.release.count({ where: { title: `${prefix}failed-create` } });

      expect({ failed: outcome.failedCreate instanceof DataError, stored }).toEqual({
        failed: true,
        stored: 0,
      });
    });
  });
});

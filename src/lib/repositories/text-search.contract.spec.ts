/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { ArtistRepository } from './artist-repository';
import { BannerNotificationRepository } from './banner-notification-repository';
import { PlaylistRepository } from './playlist-repository';
import { ProducerRepository } from './producer-repository';
import { ReleaseRepository } from './release-repository';
import { TourRepository } from './tours/tour-repository';
import { VenueRepository } from './tours/venue-repository';
import { UserRepository } from './user-repository';
import { VideoRepository } from './video-repository';

// Contract: on a real MongoDB, the site's searches read what was typed as
// text. `where-kit.contract.spec.ts` proves the helpers; this proves the
// reads built from them, through the repositories a visitor's request
// reaches. Before the helpers, a term holding `(` failed each of these with
// "Invalid Regex" (error 51111), and a dot matched any character. Runs only
// under `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;
const NOBODY = '0'.repeat(24);

/** Terms a regular expression would not compile, or would read as a pattern. */
const PATTERN_SYNTAX = ['(', '[', '*', '\\', '.*', 'a{2', '(?<x'];

const usernames = async (rows: Promise<Array<{ username: string | null }>>): Promise<string[]> =>
  (await rows).map(({ username }) => (username ?? '').slice(prefix.length)).sort();

// Every row is seeded here: the tests run shuffled and only read. Serial
// creates, for the fresh-collection read-back race.
beforeAll(async () => {
  for (const name of ['a.c', 'abc', '(x']) {
    await prisma.producer.create({ data: { name: `${prefix}${name}` } });
    await prisma.user.create({
      data: { email: `${prefix}${name}@example.com`, username: `${prefix}${name}` },
    });
  }
});

afterAll(async () => {
  await prisma.producer.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('the site’s searches read a term as text (Docker Mongo contract)', () => {
  describe.each(PATTERN_SYNTAX)('for the term %s', (term) => {
    it('the public video search and listing answer', async () => {
      await expect(VideoRepository.searchPublished(term, 5)).resolves.toEqual(expect.any(Array));
      await expect(VideoRepository.findPublished({ search: term })).resolves.toEqual(
        expect.any(Array)
      );
    });

    it('the public release listing answers', async () => {
      await expect(ReleaseRepository.findPublished({ search: term })).resolves.toEqual(
        expect.any(Array)
      );
    });

    it('the home page’s artist search answers', async () => {
      await expect(ArtistRepository.searchForHomeNav({ search: term })).resolves.toEqual(
        expect.any(Array)
      );
    });

    it('the public tour search answers', async () => {
      await expect(TourRepository.findAllPublic({ search: term, take: 5 })).resolves.toEqual(
        expect.any(Array)
      );
    });

    it('the public playlist track search answers', async () => {
      await expect(PlaylistRepository.searchPublicTrackItems(term, NOBODY, 5)).resolves.toEqual(
        expect.any(Array)
      );
    });

    it('the name lookups answer', async () => {
      await expect(ReleaseRepository.findByTitleInsensitive(term)).resolves.toBeNull();
      await expect(VenueRepository.findByName(term)).resolves.toEqual([]);
      await expect(BannerNotificationRepository.searchByContent(term, 5)).resolves.toEqual(
        expect.any(Array)
      );
    });
  });

  describe('the producer search', () => {
    it('finds a name by the parenthesis in it', async () => {
      const found = await ProducerRepository.search(`${prefix}(`, 5);

      expect(found.map(({ name }) => name)).toEqual([`${prefix}(x`]);
    });

    it('reads a dot as a dot, not as any character', async () => {
      const found = await ProducerRepository.search(`${prefix}a.c`, 5);

      expect(found.map(({ name }) => name)).toEqual([`${prefix}a.c`]);
    });
  });

  describe('the username lookups', () => {
    it('complete a prefix as typed: a dot is a dot', async () => {
      expect(
        await usernames(UserRepository.searchByUsernamePrefix(`${prefix}A.`, NOBODY, 5))
      ).toEqual(['a.c']);
    });

    it('complete a prefix that holds a parenthesis', async () => {
      expect(
        await usernames(UserRepository.searchByUsernamePrefix(`${prefix}(`, NOBODY, 5))
      ).toEqual(['(x']);
    });

    it('resolve whole usernames, whatever the case, and nothing a pattern would', async () => {
      expect(
        await usernames(UserRepository.findByUsernames([`${prefix}A.C`, `${prefix}(X`], NOBODY))
      ).toEqual(['(x', 'a.c']);
    });
  });
});

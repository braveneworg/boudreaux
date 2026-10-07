/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  checkCreditDecisions,
  needsCreditDecisions,
  toCreditAwaitingConfirmation,
  toCreditThatStaysHidden,
  type CreditAwaitingConfirmation,
  type CreditConfirmationRow,
  type HiddenCreditRow,
} from './credit-confirmation';

const GENERATED_AT = new Date('2026-09-01T00:00:00.000Z');

const awaitingRow = (over: Partial<CreditConfirmationRow> = {}): CreditConfirmationRow => ({
  id: 'artist-1',
  slug: 'mc-example',
  displayName: 'MC Example',
  firstName: 'MC',
  middleName: null,
  surname: 'Example',
  title: null,
  suffix: null,
  bio: null,
  shortBio: null,
  altBio: null,
  bioGeneratedAt: null,
  bioImages: [],
  ...over,
});

const hiddenRow = (over: Partial<HiddenCreditRow> = {}): HiddenCreditRow => ({
  id: 'artist-2',
  slug: 'old-duplicate',
  displayName: null,
  firstName: 'Old',
  middleName: null,
  surname: 'Duplicate',
  title: null,
  suffix: null,
  deletedOn: null,
  ...over,
});

const awaiting = (id: string, name: string, displayImageCount = 1): CreditAwaitingConfirmation => ({
  id,
  slug: id,
  name,
  bioState: 'none',
  bioGeneratedAt: null,
  displayImageCount,
});

describe('credit-confirmation', () => {
  describe('checkCreditDecisions', () => {
    const credits = [awaiting('a', 'Abel'), awaiting('b', 'Bea')];

    it('passes when every awaiting credit is published or kept hidden', () => {
      const result = checkCreditDecisions(credits, {
        publishArtistIds: ['a'],
        keepHiddenArtistIds: ['b'],
      });

      expect(result).toEqual({ ok: true });
    });

    it('passes with no decisions when nothing awaits confirmation', () => {
      const result = checkCreditDecisions([], { publishArtistIds: [], keepHiddenArtistIds: [] });

      expect(result).toEqual({ ok: true });
    });

    it('names the awaiting credits nobody decided on', () => {
      const result = checkCreditDecisions(credits, {
        publishArtistIds: ['a'],
        keepHiddenArtistIds: [],
      });

      expect(result).toEqual({
        ok: false,
        error: 'Choose to publish or keep hidden: Bea',
      });
    });

    it('rejects publishing an artist that does not await confirmation', () => {
      const result = checkCreditDecisions(credits, {
        publishArtistIds: ['a', 'b', 'zzz'],
        keepHiddenArtistIds: [],
      });

      expect(result).toEqual({
        ok: false,
        error: 'These artists cannot be published with this release: zzz',
      });
    });

    it('rejects an artist that is both published and kept hidden', () => {
      const result = checkCreditDecisions(credits, {
        publishArtistIds: ['a', 'b'],
        keepHiddenArtistIds: ['b'],
      });

      expect(result).toEqual({
        ok: false,
        error: 'An artist cannot be both published and kept hidden: Bea',
      });
    });

    // ADR-0019: an artist with no chosen display image can only be kept hidden.
    it('refuses to publish an artist with no display image, naming it', () => {
      const result = checkCreditDecisions([awaiting('a', 'Ada', 0), awaiting('b', 'Bo')], {
        publishArtistIds: ['a', 'b'],
        keepHiddenArtistIds: [],
      });

      expect(result).toEqual({
        ok: false,
        error: 'These artists have no display image and can only be kept hidden: Ada',
      });
    });

    it('lets an artist with no display image be kept hidden', () => {
      const result = checkCreditDecisions([awaiting('a', 'Ada', 0)], {
        publishArtistIds: [],
        keepHiddenArtistIds: ['a'],
      });

      expect(result).toEqual({ ok: true });
    });

    it('ignores a keep-hidden artist that no longer awaits confirmation', () => {
      const result = checkCreditDecisions(credits, {
        publishArtistIds: ['a', 'b'],
        keepHiddenArtistIds: ['zzz'],
      });

      expect(result).toEqual({ ok: true });
    });
  });

  describe('needsCreditDecisions', () => {
    it('is true when a credit awaits confirmation', () => {
      expect(needsCreditDecisions({ awaiting: [awaiting('a', 'Abel')], stayHidden: [] })).toBe(
        true
      );
    });

    it('is false when credits only stay hidden', () => {
      expect(
        needsCreditDecisions({
          awaiting: [],
          stayHidden: [{ id: 'x', slug: 'x', name: 'X', reason: 'deleted' }],
        })
      ).toBe(false);
    });
  });

  describe('toCreditAwaitingConfirmation', () => {
    it('carries the id, slug and displayed name', () => {
      const credit = toCreditAwaitingConfirmation(awaitingRow());

      expect(credit).toMatchObject({ id: 'artist-1', slug: 'mc-example', name: 'MC Example' });
    });

    it('composes the name from its parts when no display name is stored', () => {
      const credit = toCreditAwaitingConfirmation(awaitingRow({ displayName: null }));

      expect(credit.name).toBe('MC Example');
    });

    it('reports no bio when every bio field is blank', () => {
      const credit = toCreditAwaitingConfirmation(awaitingRow({ bio: '  ', shortBio: '' }));

      expect(credit.bioState).toBe('none');
    });

    it('reports a hand-written bio when text exists and nothing was generated', () => {
      const credit = toCreditAwaitingConfirmation(awaitingRow({ shortBio: 'Rapper.' }));

      expect(credit.bioState).toBe('hand-written');
    });

    it('reports a generated bio when a generation date is recorded', () => {
      const credit = toCreditAwaitingConfirmation(
        awaitingRow({ bio: 'Long bio.', bioGeneratedAt: GENERATED_AT })
      );

      expect(credit.bioState).toBe('generated');
    });

    it('carries the generation date of a generated bio', () => {
      const credit = toCreditAwaitingConfirmation(
        awaitingRow({ altBio: 'Punchy.', bioGeneratedAt: GENERATED_AT })
      );

      expect(credit.bioGeneratedAt).toEqual(GENERATED_AT);
    });

    it('drops the generation date when no bio text survives', () => {
      const credit = toCreditAwaitingConfirmation(awaitingRow({ bioGeneratedAt: GENERATED_AT }));

      expect(credit).toMatchObject({ bioState: 'none', bioGeneratedAt: null });
    });

    // ADR-0019 counts chosen images only: a suggestion the fallback would
    // show is not a human's choice and does not make the artist publishable.
    it('counts the chosen display images only', () => {
      const credit = toCreditAwaitingConfirmation(
        awaitingRow({
          bioImages: [
            { isPrimary: true, displayOrder: null, alt: 'On stage' },
            { isPrimary: false, displayOrder: 1, alt: null },
            { isPrimary: false, displayOrder: 0, alt: 'Portrait' },
          ],
        })
      );

      expect(credit.displayImageCount).toBe(2);
    });

    it('counts zero when only suggestions exist', () => {
      const credit = toCreditAwaitingConfirmation(
        awaitingRow({ bioImages: [{ isPrimary: true, displayOrder: null, alt: 'On stage' }] })
      );

      expect(credit.displayImageCount).toBe(0);
    });
  });

  describe('toCreditThatStaysHidden', () => {
    it('gives a soft-deleted artist the deleted reason', () => {
      const credit = toCreditThatStaysHidden(hiddenRow({ deletedOn: new Date() }));

      expect(credit.reason).toBe('deleted');
    });

    it('carries the id, slug and displayed name', () => {
      const credit = toCreditThatStaysHidden(hiddenRow({ deletedOn: new Date() }));

      expect(credit).toMatchObject({
        id: 'artist-2',
        slug: 'old-duplicate',
        name: 'Old Duplicate',
      });
    });
  });
});

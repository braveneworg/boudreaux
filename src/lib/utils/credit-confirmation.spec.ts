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
  isActive: true,
  deactivatedAt: null,
  deletedOn: null,
  ...over,
});

const awaiting = (id: string, name: string): CreditAwaitingConfirmation => ({
  id,
  slug: id,
  name,
  bioState: 'none',
  bioGeneratedAt: null,
  displayImageCount: 0,
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

    it('counts the display images the public page would show', () => {
      const credit = toCreditAwaitingConfirmation(
        awaitingRow({
          bioImages: [
            { isPrimary: true, displayOrder: null, alt: 'On stage' },
            { isPrimary: true, displayOrder: null, alt: null },
            { isPrimary: false, displayOrder: null, alt: 'Portrait' },
          ],
        })
      );

      expect(credit.displayImageCount).toBe(1);
    });
  });

  describe('toCreditThatStaysHidden', () => {
    it('gives a soft-deleted artist the deleted reason', () => {
      const credit = toCreditThatStaysHidden(hiddenRow({ deletedOn: new Date() }));

      expect(credit.reason).toBe('deleted');
    });

    it('gives an inactive artist with no departure date the roster reason', () => {
      const credit = toCreditThatStaysHidden(hiddenRow({ isActive: false }));

      expect(credit.reason).toBe('no-departure-date');
    });

    it('prefers the deleted reason when both apply', () => {
      const credit = toCreditThatStaysHidden(hiddenRow({ isActive: false, deletedOn: new Date() }));

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

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  COMMUNITY_LIST_MAX_TAKE,
  COMMUNITY_PAGE_SIZE,
  COMMUNITY_SEARCH_MAX,
} from '@/lib/constants/submissions';

import {
  submissionCardPageSchema,
  submissionListingQuerySchema,
} from './submission-listing-schema';

const card = {
  id: 'c'.repeat(24),
  title: 'Bus poem',
  category: 'WRITING',
  cardPictureUrl: null,
  owner: { username: 'ada', gravatarHash: 'abc123' },
};

describe('submissionListingQuerySchema', () => {
  it('reads an empty query as the first page of everything', () => {
    expect(submissionListingQuerySchema.parse({})).toEqual({
      skip: 0,
      take: COMMUNITY_PAGE_SIZE,
      search: '',
      user: '',
    });
  });

  it('reads the numbers a query string carries as text', () => {
    expect(submissionListingQuerySchema.parse({ skip: '24', take: '8' })).toMatchObject({
      skip: 24,
      take: 8,
    });
  });

  it('trims the search term and the username', () => {
    expect(submissionListingQuerySchema.parse({ search: '  bus ', user: ' ada ' })).toMatchObject({
      search: 'bus',
      user: 'ada',
    });
  });

  it('accepts the largest page', () => {
    expect(
      submissionListingQuerySchema.safeParse({ take: String(COMMUNITY_LIST_MAX_TAKE) }).success
    ).toBe(true);
  });

  it.each([
    ['a page over the largest', { take: String(COMMUNITY_LIST_MAX_TAKE + 1) }],
    ['an empty page', { take: '0' }],
    ['a negative offset', { skip: '-1' }],
    ['a fractional offset', { skip: '1.5' }],
    ['an offset that is not a number', { skip: 'abc' }],
    ['a search term past the limit', { search: 'a'.repeat(COMMUNITY_SEARCH_MAX + 1) }],
    ['a username past the limit', { user: 'a'.repeat(101) }],
  ])('refuses %s', (_name, query) => {
    expect(submissionListingQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('submissionCardPageSchema', () => {
  it('reads a page of cards', () => {
    const page = { rows: [card, { ...card, cardPictureUrl: 'https://cdn.example/card.webp' }] };

    expect(submissionCardPageSchema.parse({ ...page, nextSkip: 12 })).toEqual({
      ...page,
      nextSkip: 12,
    });
  });

  it('reads the last page, and an owner with no username', () => {
    const rows = [{ ...card, owner: { username: null, gravatarHash: 'abc123' } }];

    expect(submissionCardPageSchema.parse({ rows, nextSkip: null })).toEqual({
      rows,
      nextSkip: null,
    });
  });

  it.each([
    ['a card with no avatar hash', { ...card, owner: { username: 'ada' } }],
    ['a card in a category that does not exist', { ...card, category: 'PODCAST' }],
  ])('refuses %s', (_name, row) => {
    expect(submissionCardPageSchema.safeParse({ rows: [row], nextSkip: null }).success).toBe(false);
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { creditConfirmationSchema, publishedWorkSchema } from './credit-confirmation-schema';

const awaiting = {
  id: 'a',
  slug: 'abel',
  name: 'Abel',
  bioState: 'generated',
  bioGeneratedAt: '2026-09-01T00:00:00.000Z',
  displayImageCount: 2,
};

describe('creditConfirmationSchema', () => {
  it('parses both lists and revives the generation date', () => {
    const parsed = creditConfirmationSchema.parse({
      awaiting: [awaiting],
      stayHidden: [{ id: 'x', slug: 'gone', name: 'Gone', reason: 'deleted' }],
    });

    expect(parsed).toEqual({
      awaiting: [{ ...awaiting, bioGeneratedAt: new Date('2026-09-01T00:00:00.000Z') }],
      stayHidden: [{ id: 'x', slug: 'gone', name: 'Gone', reason: 'deleted' }],
    });
  });

  it('keeps a missing generation date null', () => {
    const parsed = creditConfirmationSchema.parse({
      awaiting: [{ ...awaiting, bioState: 'none', bioGeneratedAt: null }],
      stayHidden: [],
    });

    expect(parsed.awaiting[0].bioGeneratedAt).toBeNull();
  });

  it('rejects an unknown bio state', () => {
    const result = creditConfirmationSchema.safeParse({
      awaiting: [{ ...awaiting, bioState: 'draft' }],
      stayHidden: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects the reason of the roster rule that was removed', () => {
    const result = creditConfirmationSchema.safeParse({
      awaiting: [],
      stayHidden: [{ id: 'x', slug: 'gone', name: 'Gone', reason: 'no-departure-date' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown hidden reason', () => {
    const result = creditConfirmationSchema.safeParse({
      awaiting: [],
      stayHidden: [{ id: 'x', slug: 'gone', name: 'Gone', reason: 'banned' }],
    });

    expect(result.success).toBe(false);
  });
});

describe('publishedWorkSchema', () => {
  it('parses releases and tour dates and revives the start date', () => {
    const parsed = publishedWorkSchema.parse({
      releases: [{ id: 'r', title: 'Album', leavesNoByline: true }],
      tourDates: [
        { id: 'd', startDate: '2026-11-01T00:00:00.000Z', tourId: 't', tourTitle: 'Fall Tour' },
      ],
    });

    expect(parsed).toEqual({
      releases: [{ id: 'r', title: 'Album', leavesNoByline: true }],
      tourDates: [
        {
          id: 'd',
          startDate: new Date('2026-11-01T00:00:00.000Z'),
          tourId: 't',
          tourTitle: 'Fall Tour',
        },
      ],
    });
  });
});

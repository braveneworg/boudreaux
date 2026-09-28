/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { creditDecisionsSchema } from './credit-decisions-schema';

const ID_A = '507f1f77bcf86cd799439011';
const ID_B = '507f1f77bcf86cd799439012';

describe('creditDecisionsSchema', () => {
  it('accepts a publish list and a keep-hidden list of artist ids', () => {
    const parsed = creditDecisionsSchema.parse({
      publishArtistIds: [ID_A],
      keepHiddenArtistIds: [ID_B],
    });

    expect(parsed).toEqual({ publishArtistIds: [ID_A], keepHiddenArtistIds: [ID_B] });
  });

  it('defaults both lists to empty', () => {
    expect(creditDecisionsSchema.parse({})).toEqual({
      publishArtistIds: [],
      keepHiddenArtistIds: [],
    });
  });

  it('rejects a value that is not an artist id', () => {
    const result = creditDecisionsSchema.safeParse({ publishArtistIds: ['mc-example'] });

    expect(result.success).toBe(false);
  });

  it('rejects more ids than a release can credit', () => {
    const result = creditDecisionsSchema.safeParse({
      keepHiddenArtistIds: Array.from({ length: 201 }, () => ID_A),
    });

    expect(result.success).toBe(false);
  });

  it('drops unknown keys', () => {
    const parsed = creditDecisionsSchema.parse({ publishArtistIds: [ID_A], publishedBy: 'me' });

    expect(parsed).not.toHaveProperty('publishedBy');
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readCreditDecisions } from './read-credit-decisions';

const ID_A = '507f1f77bcf86cd799439011';

describe('readCreditDecisions', () => {
  it('reads the decisions the form sent beside its values', () => {
    const input = {
      title: 'A',
      creditDecisions: { publishArtistIds: [ID_A], keepHiddenArtistIds: [] },
    };

    expect(readCreditDecisions(input)).toEqual({
      ok: true,
      decisions: { publishArtistIds: [ID_A], keepHiddenArtistIds: [] },
    });
  });

  it('reads no decisions when the form sent none', () => {
    expect(readCreditDecisions({ title: 'A' })).toEqual({
      ok: true,
      decisions: { publishArtistIds: [], keepHiddenArtistIds: [] },
    });
  });

  it('reads no decisions from an input that is not an object', () => {
    expect(readCreditDecisions(null)).toEqual({
      ok: true,
      decisions: { publishArtistIds: [], keepHiddenArtistIds: [] },
    });
  });

  it('rejects decisions sent as a string', () => {
    const input = { creditDecisions: JSON.stringify({ publishArtistIds: [ID_A] }) };

    expect(readCreditDecisions(input)).toEqual({ ok: false });
  });

  it('rejects decisions that are not artist ids', () => {
    expect(readCreditDecisions({ creditDecisions: { publishArtistIds: ['mc-example'] } })).toEqual({
      ok: false,
    });
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CREDIT_DECISIONS_FIELD, readCreditDecisions } from './read-credit-decisions';

const ID_A = '507f1f77bcf86cd799439011';

const payloadWith = (value?: string): FormData => {
  const payload = new FormData();
  if (value !== undefined) {
    payload.append(CREDIT_DECISIONS_FIELD, value);
  }
  return payload;
};

describe('readCreditDecisions', () => {
  it('reads the decisions a form sent as JSON', () => {
    const payload = payloadWith(
      JSON.stringify({ publishArtistIds: [ID_A], keepHiddenArtistIds: [] })
    );

    expect(readCreditDecisions(payload)).toEqual({
      ok: true,
      decisions: { publishArtistIds: [ID_A], keepHiddenArtistIds: [] },
    });
  });

  it('reads no decisions when the form sent none', () => {
    expect(readCreditDecisions(payloadWith())).toEqual({
      ok: true,
      decisions: { publishArtistIds: [], keepHiddenArtistIds: [] },
    });
  });

  it('rejects a value that is not JSON', () => {
    expect(readCreditDecisions(payloadWith('not json'))).toEqual({ ok: false });
  });

  it('rejects decisions that are not artist ids', () => {
    const payload = payloadWith(JSON.stringify({ publishArtistIds: ['mc-example'] }));

    expect(readCreditDecisions(payload)).toEqual({ ok: false });
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPlayableFormat, PLAYABLE_FORMAT_TYPE } from './playable-format';

describe('isPlayableFormat', () => {
  it('accepts the active playable format', () => {
    expect(isPlayableFormat({ formatType: PLAYABLE_FORMAT_TYPE })).toBe(true);
    expect(isPlayableFormat({ formatType: PLAYABLE_FORMAT_TYPE, deletedAt: null })).toBe(true);
  });

  it('refuses a withdrawn playable format', () => {
    expect(
      isPlayableFormat({ formatType: PLAYABLE_FORMAT_TYPE, deletedAt: new Date('2026-01-01') })
    ).toBe(false);
  });

  it('refuses every paid format', () => {
    expect(isPlayableFormat({ formatType: 'FLAC' })).toBe(false);
    expect(isPlayableFormat({ formatType: 'AAC' })).toBe(false);
  });
});

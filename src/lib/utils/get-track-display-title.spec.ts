/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';

describe('getTrackDisplayTitle', () => {
  it('returns the title directly when provided', () => {
    expect(getTrackDisplayTitle('My Song', 'some-file.mp3')).toBe('My Song');
  });

  it('strips file extension from fileName', () => {
    expect(getTrackDisplayTitle(null, 'my-song.mp3')).toBe('My Song');
  });

  it('strips upload hash suffix from fileName', () => {
    expect(getTrackDisplayTitle(null, '01-choke-parade-1771039644854-5npsru.mp3')).toBe(
      'Choke Parade'
    );
  });

  it('strips artist---album--- prefix from fileName', () => {
    expect(
      getTrackDisplayTitle(
        null,
        'ceschi---broken-bone-ballads---01-choke-parade-1771039644854-5npsru.mp3'
      )
    ).toBe('Choke Parade');
  });

  it('strips leading track number from fileName', () => {
    expect(getTrackDisplayTitle(null, '05-daybreak-1771039423014-d7rq8x.mp3')).toBe('Daybreak');
  });

  it('handles fileName with no track number', () => {
    expect(getTrackDisplayTitle(null, 'my-great-song.mp3')).toBe('My Great Song');
  });

  it('handles fileName with multiple --- segments', () => {
    expect(
      getTrackDisplayTitle(
        null,
        'ceschi---bring-us-the-head-of-francisco-false--par-1771039500981-x78lwz.mp3'
      )
    ).toBe('Bring Us The Head Of Francisco False  Par');
  });

  it('returns original fileName when stripping produces empty string', () => {
    expect(getTrackDisplayTitle(null, '.mp3')).toBe('.mp3');
  });

  it('handles undefined title', () => {
    expect(getTrackDisplayTitle(undefined, '01-some-song.mp3')).toBe('Some Song');
  });

  it('handles fileName without hash suffix', () => {
    expect(getTrackDisplayTitle(null, '01-some-song.mp3')).toBe('Some Song');
  });

  it('handles empty string title by falling back to fileName', () => {
    expect(getTrackDisplayTitle('', '01-some-song.mp3')).toBe('Some Song');
  });

  it('title-cases multi-word names', () => {
    expect(getTrackDisplayTitle(null, 'say-no-more.mp3')).toBe('Say No More');
  });
});

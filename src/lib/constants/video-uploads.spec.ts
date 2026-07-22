/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isVideoNamespacedKey } from './video-uploads';

describe('isVideoNamespacedKey', () => {
  it('accepts a key under the video namespace', () => {
    expect(isVideoNamespacedKey('media/videos/vid-1/poster.jpg')).toBe(true);
  });

  it('rejects a key in another media namespace', () => {
    expect(isVideoNamespacedKey('media/artists/artist-1/photo.jpg')).toBe(false);
  });

  it('rejects null', () => {
    expect(isVideoNamespacedKey(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isVideoNamespacedKey(undefined)).toBe(false);
  });
});

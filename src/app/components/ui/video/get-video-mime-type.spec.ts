/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getVideoMimeType } from './get-video-mime-type';

describe('getVideoMimeType', () => {
  it('maps an .mp4 extension to video/mp4', () => {
    expect(getVideoMimeType('https://cdn.example.com/clip.mp4')).toBe('video/mp4');
  });

  it('maps a .webm extension to video/webm', () => {
    expect(getVideoMimeType('https://cdn.example.com/clip.webm')).toBe('video/webm');
  });

  it('lowercases the extension before matching', () => {
    expect(getVideoMimeType('https://cdn.example.com/CLIP.MP4')).toBe('video/mp4');
  });

  it('strips a signed query string before reading the extension', () => {
    expect(getVideoMimeType('https://cdn.example.com/clip.webm?Expires=1&Signature=abc')).toBe(
      'video/webm'
    );
  });

  it('defaults to video/mp4 when there is no recognizable extension', () => {
    expect(getVideoMimeType('https://cdn.example.com/clip')).toBe('video/mp4');
  });
});

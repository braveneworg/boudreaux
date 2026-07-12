/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { deriveBioLinkLabel } from './derive-bio-link-label';

describe('deriveBioLinkLabel', () => {
  it('returns the hostname for an http(s) URL', () => {
    expect(deriveBioLinkLabel('https://en.wikipedia.org/wiki/Ceschi')).toBe('en.wikipedia.org');
  });

  it('strips a leading www. from the hostname', () => {
    expect(deriveBioLinkLabel('https://www.pitchfork.com/reviews/x')).toBe('pitchfork.com');
  });

  it('returns the raw input when the URL cannot be parsed', () => {
    expect(deriveBioLinkLabel('not a url')).toBe('not a url');
  });
});

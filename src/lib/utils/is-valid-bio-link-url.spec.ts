/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isValidBioLinkUrl } from './is-valid-bio-link-url';

describe('isValidBioLinkUrl', () => {
  it('accepts an https URL', () => {
    expect(isValidBioLinkUrl('https://example.com')).toBe(true);
  });

  it('accepts an http URL', () => {
    expect(isValidBioLinkUrl('http://example.com/path')).toBe(true);
  });

  it('accepts a site-relative path', () => {
    expect(isValidBioLinkUrl('/releases/some-slug')).toBe(true);
  });

  it('accepts a root-only site-relative path', () => {
    expect(isValidBioLinkUrl('/')).toBe(true);
  });

  it('rejects a javascript: scheme', () => {
    expect(isValidBioLinkUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects a data: scheme', () => {
    expect(isValidBioLinkUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects a protocol-relative // URL', () => {
    expect(isValidBioLinkUrl('//example.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidBioLinkUrl('')).toBe(false);
  });
});

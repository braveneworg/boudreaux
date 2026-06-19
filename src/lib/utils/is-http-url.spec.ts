/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isHttpUrl } from './is-http-url';

describe('isHttpUrl', () => {
  it('accepts an https URL', () => {
    expect(isHttpUrl('https://example.com/path')).toBe(true);
  });

  it('accepts an http URL', () => {
    expect(isHttpUrl('http://example.com')).toBe(true);
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(isHttpUrl('  https://example.com  ')).toBe(true);
  });

  it('rejects a javascript: scheme', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects a data: scheme', () => {
    expect(isHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects a scheme with no host', () => {
    expect(isHttpUrl('https://')).toBe(false);
  });

  it('rejects a non-URL string', () => {
    expect(isHttpUrl('not a url')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isHttpUrl('')).toBe(false);
  });
});

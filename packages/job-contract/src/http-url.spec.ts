/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { httpUrl } from './http-url';

describe('httpUrl', () => {
  it.each(['https://example.com/a', 'http://example.com', '  https://example.com/padded  '])(
    'accepts the http(s) URL %j',
    (value) => {
      expect(httpUrl.safeParse(value).success).toBe(true);
    }
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html,<b>hi</b>',
    'ftp://example.com/file',
    'https://',
    'example.com',
    '',
  ])('rejects %j', (value) => {
    expect(httpUrl.safeParse(value).success).toBe(false);
  });

  it('reports the shared error message', () => {
    const result = httpUrl.safeParse('javascript:alert(1)');

    expect(result.error?.issues.map(({ message }) => message)).toEqual(['Must be an http(s) URL']);
  });

  it('keeps chained string checks available to callers', () => {
    expect(httpUrl.max(20).safeParse('https://example.com/far-too-long').success).toBe(false);
  });
});

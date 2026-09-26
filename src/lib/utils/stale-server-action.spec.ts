/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isStaleServerActionError, STALE_PAGE_MESSAGE } from './stale-server-action';

/** What Next.js throws on the client when the action id is from an older build. */
const nextError = (): Error => {
  const error = new Error(
    'Server Action "709bd552d9e99952fa5490a0605483656b464dacdc" was not found on the server.\n' +
      'Read more: https://nextjs.org/docs/messages/failed-to-find-server-action'
  );
  error.name = 'UnrecognizedActionError';
  return error;
};

describe('isStaleServerActionError', () => {
  it('recognizes the Next.js UnrecognizedActionError by name', () => {
    expect(isStaleServerActionError(nextError())).toBe(true);
  });

  it('recognizes the message alone when the name is a plain Error', () => {
    const error = new Error('Server Action "abc" was not found on the server.');
    expect(isStaleServerActionError(error)).toBe(true);
  });

  it('recognizes a non-Error object carrying the same message', () => {
    expect(
      isStaleServerActionError({ message: 'Server Action "abc" was not found on the server.' })
    ).toBe(true);
  });

  it.each([
    ['an ordinary error', new Error('Failed to upload image')],
    ['a string', 'Server Action not found'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
  ])('ignores %s', (_label, value) => {
    expect(isStaleServerActionError(value)).toBe(false);
  });
});

describe('STALE_PAGE_MESSAGE', () => {
  it('tells the admin to reload', () => {
    expect(STALE_PAGE_MESSAGE).toMatch(/reload/i);
  });
});

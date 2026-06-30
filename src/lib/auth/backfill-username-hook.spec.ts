/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { backfillUsername, generatePlaceholderUsername } from './backfill-username-hook';

vi.mock('server-only', () => ({}));

vi.mock('unique-username-generator', () => ({
  generateUsername: vi.fn(() => 'placeholder1234'),
}));

describe('generatePlaceholderUsername', () => {
  it('returns the generated username', () => {
    expect(generatePlaceholderUsername()).toBe('placeholder1234');
  });
});

describe('backfillUsername', () => {
  it('backfills a generated username when none is provided', () => {
    expect(backfillUsername({ email: 'fan@example.com' })).toEqual({
      data: { email: 'fan@example.com', username: 'placeholder1234' },
    });
  });

  it('backfills when username is null', () => {
    expect(backfillUsername({ email: 'fan@example.com', username: null }).data.username).toBe(
      'placeholder1234'
    );
  });

  it('backfills when username is an empty string', () => {
    expect(backfillUsername({ email: 'fan@example.com', username: '' }).data.username).toBe(
      'placeholder1234'
    );
  });

  it('preserves a username that is already set (e.g. from the signup action)', () => {
    expect(
      backfillUsername({ email: 'fan@example.com', username: 'real-user' }).data.username
    ).toBe('real-user');
  });

  it('preserves the other user fields unchanged', () => {
    const result = backfillUsername({ email: 'fan@example.com', name: 'Fan', emailVerified: true });

    expect(result.data).toMatchObject({
      email: 'fan@example.com',
      name: 'Fan',
      emailVerified: true,
    });
  });
});

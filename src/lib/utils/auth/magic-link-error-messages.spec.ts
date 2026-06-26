/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { magicLinkErrorMessage } from './magic-link-error-messages';

describe('magicLinkErrorMessage', () => {
  it('maps the signup-disabled code', () => {
    expect(magicLinkErrorMessage('new_user_signup_disabled')).toBe(
      'Signups are temporarily paused.'
    );
  });

  it('returns null for unknown codes', () => {
    expect(magicLinkErrorMessage('failed_to_create_user')).toBeNull();
  });

  it('returns null for nullish input', () => {
    expect(magicLinkErrorMessage(undefined)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(magicLinkErrorMessage(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(magicLinkErrorMessage('')).toBeNull();
  });
});

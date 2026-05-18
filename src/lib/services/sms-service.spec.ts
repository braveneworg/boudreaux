/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { resolveSmsProvider } from './sms-service';

vi.mock('server-only', () => ({}));

describe('resolveSmsProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns "noop" when SMS_PROVIDER is unset', () => {
    delete process.env.SMS_PROVIDER;
    expect(resolveSmsProvider()).toBe('noop');
  });

  it('returns "sns" when SMS_PROVIDER=sns (case-insensitive, trimmed)', () => {
    vi.stubEnv('SMS_PROVIDER', '  SNS  ');
    expect(resolveSmsProvider()).toBe('sns');
  });

  it('returns "noop" explicitly when SMS_PROVIDER=noop', () => {
    vi.stubEnv('SMS_PROVIDER', 'noop');
    expect(resolveSmsProvider()).toBe('noop');
  });

  it('falls back to "noop" for unknown providers', () => {
    vi.stubEnv('SMS_PROVIDER', 'twilio');
    expect(resolveSmsProvider()).toBe('noop');
  });
});

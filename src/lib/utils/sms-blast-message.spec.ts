/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildSmsBlastMessage, getSmsOptOutLine } from './sms-blast-message';

describe('getSmsOptOutLine', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses NEXT_PUBLIC_BASE_URL when set', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com');
    expect(getSmsOptOutLine()).toBe('Opt out: https://example.com/profile');
  });

  it('falls back to fakefourrecords.com when NEXT_PUBLIC_BASE_URL is absent', () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    expect(getSmsOptOutLine()).toBe('Opt out: https://fakefourrecords.com/profile');
  });
});

describe('buildSmsBlastMessage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('appends the opt-out line separated by a blank line', () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    const result = buildSmsBlastMessage('Hi');
    expect(result).toBe('Hi\n\nOpt out: https://fakefourrecords.com/profile');
  });

  it('uses the configured base URL in the opt-out line', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com');
    const result = buildSmsBlastMessage('Hello fans');
    expect(result.endsWith('\n\nOpt out: https://example.com/profile')).toBe(true);
  });
});

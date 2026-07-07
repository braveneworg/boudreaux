/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SMS_BLAST_MESSAGE_MAX, smsBlastSchema } from './sms-blast-schema';

describe('smsBlastSchema', () => {
  it('trims surrounding whitespace from message', () => {
    const result = smsBlastSchema.parse({ message: '  Hello world  ' });
    expect(result.message).toBe('Hello world');
  });

  it('rejects an empty string', () => {
    expect(smsBlastSchema.safeParse({ message: '' }).success).toBe(false);
  });

  it('rejects a whitespace-only message', () => {
    expect(smsBlastSchema.safeParse({ message: '   ' }).success).toBe(false);
  });

  it('accepts exactly 320 characters', () => {
    expect(smsBlastSchema.safeParse({ message: 'A'.repeat(320) }).success).toBe(true);
  });

  it('rejects 321 characters with the max error message', () => {
    const result = smsBlastSchema.safeParse({ message: 'A'.repeat(321) });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((e) => e.message)).toContain(
      `Message must be ${SMS_BLAST_MESSAGE_MAX} characters or fewer`
    );
  });
});

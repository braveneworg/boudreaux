/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  banIdentitySchema,
  disableChatUserSchema,
  enableChatUserSchema,
  submitAbuseReportSchema,
  toggleMessageHiddenSchema,
} from './abuse-report-schema';

const VALID_ID = '5f9d5b7a3b9d4f5a3b9d4f5a';

describe('submitAbuseReportSchema', () => {
  it('accepts a trimmed username', () => {
    const result = submitAbuseReportSchema.safeParse({ reportedUsername: '  alice  ' });
    expect(result.success).toBe(true);
    const data = result.success ? result.data : null;
    expect(data?.reportedUsername).toBe('alice');
  });

  it('rejects an empty string', () => {
    const result = submitAbuseReportSchema.safeParse({ reportedUsername: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only input', () => {
    const result = submitAbuseReportSchema.safeParse({ reportedUsername: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects usernames longer than 64 chars', () => {
    const result = submitAbuseReportSchema.safeParse({ reportedUsername: 'a'.repeat(65) });
    expect(result.success).toBe(false);
  });
});

describe('disableChatUserSchema', () => {
  it('accepts a valid ObjectId with optional reason', () => {
    const result = disableChatUserSchema.safeParse({ userId: VALID_ID, reason: 'spam' });
    expect(result.success).toBe(true);
  });

  it('accepts without a reason', () => {
    const result = disableChatUserSchema.safeParse({ userId: VALID_ID });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed id', () => {
    const result = disableChatUserSchema.safeParse({ userId: 'not-an-id' });
    expect(result.success).toBe(false);
  });

  it('rejects reasons over 500 chars', () => {
    const result = disableChatUserSchema.safeParse({
      userId: VALID_ID,
      reason: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('enableChatUserSchema', () => {
  it('accepts a valid id', () => {
    expect(enableChatUserSchema.safeParse({ userId: VALID_ID }).success).toBe(true);
  });

  it('rejects an empty id', () => {
    expect(enableChatUserSchema.safeParse({ userId: '' }).success).toBe(false);
  });
});

describe('toggleMessageHiddenSchema', () => {
  it('accepts a valid id with hidden=true', () => {
    expect(toggleMessageHiddenSchema.safeParse({ messageId: VALID_ID, hidden: true }).success).toBe(
      true
    );
  });

  it('rejects a non-boolean hidden flag', () => {
    expect(
      toggleMessageHiddenSchema.safeParse({ messageId: VALID_ID, hidden: 'yes' }).success
    ).toBe(false);
  });
});

describe('banIdentitySchema', () => {
  it('accepts a valid email + optional fingerprint', () => {
    const result = banIdentitySchema.safeParse({
      email: 'Banned@Example.com',
      fingerprintHash: 'abc',
    });
    expect(result.success).toBe(true);
    const data = result.success ? result.data : null;
    expect(data?.email).toBe('banned@example.com');
  });

  it('rejects malformed emails', () => {
    expect(banIdentitySchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('accepts a null fingerprint', () => {
    const result = banIdentitySchema.safeParse({
      email: 'banned@example.com',
      fingerprintHash: null,
    });
    expect(result.success).toBe(true);
  });
});

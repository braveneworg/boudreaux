/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { updateChatUserSchema } from './chat-user-admin-schema';

const validUserId = 'abcdef1234567890abcdef12';

describe('updateChatUserSchema', () => {
  it('accepts a disabled-only payload', () => {
    expect(updateChatUserSchema.safeParse({ userId: validUserId, disabled: true }).success).toBe(
      true
    );
  });

  it('accepts a clearFlag-only payload', () => {
    expect(updateChatUserSchema.safeParse({ userId: validUserId, clearFlag: true }).success).toBe(
      true
    );
  });

  it('accepts both fields together', () => {
    expect(
      updateChatUserSchema.safeParse({ userId: validUserId, disabled: false, clearFlag: true })
        .success
    ).toBe(true);
  });

  it('accepts disabled set to false (re-enable)', () => {
    expect(updateChatUserSchema.safeParse({ userId: validUserId, disabled: false }).success).toBe(
      true
    );
  });

  it('rejects an empty patch (no toggle / no flag clear)', () => {
    const result = updateChatUserSchema.safeParse({ userId: validUserId });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean disabled', () => {
    expect(updateChatUserSchema.safeParse({ userId: validUserId, disabled: 'yes' }).success).toBe(
      false
    );
  });

  it('rejects a missing userId', () => {
    expect(updateChatUserSchema.safeParse({ disabled: true }).success).toBe(false);
  });

  it('rejects a malformed userId (not a 24-char hex ObjectId)', () => {
    expect(updateChatUserSchema.safeParse({ userId: 'not-an-id', disabled: true }).success).toBe(
      false
    );
  });

  it('accepts uppercase hex in userId', () => {
    expect(
      updateChatUserSchema.safeParse({ userId: 'ABCDEF1234567890ABCDEF12', disabled: true }).success
    ).toBe(true);
  });
});

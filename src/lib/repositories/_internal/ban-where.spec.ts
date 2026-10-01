/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { banWhere } from './ban-where';
import { chatMessageWhere } from './chat-message-where';
import { isPresent, isUnset } from './where-kit';

describe('banWhere', () => {
  it('active and lifted are the null-safe pair over unbannedAt', () => {
    expect(banWhere.active).toEqual(isUnset('unbannedAt'));
    expect(banWhere.lifted).toEqual(isPresent('unbannedAt'));
  });
});

describe('chatMessageWhere', () => {
  it('visible and hidden are the null-safe pair over hiddenAt; pinned is a present pinnedAt', () => {
    expect(chatMessageWhere.visible).toEqual(isUnset('hiddenAt'));
    expect(chatMessageWhere.hidden).toEqual(isPresent('hiddenAt'));
    expect(chatMessageWhere.pinned).toEqual(isPresent('pinnedAt'));
  });

  it('byAllowedAuthor excludes disabled chat profiles and active bans through the author', () => {
    expect(chatMessageWhere.byAllowedAuthor).toEqual({
      user: {
        is: {
          chatUsers: { none: { disabled: true } },
          bannedIdentities: { none: banWhere.active },
        },
      },
    });
  });
});

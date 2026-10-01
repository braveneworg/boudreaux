/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { banWhere } from './ban-where';
import { isPresent, isUnset } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * Chat-message `where` fragments. A message is hidden by stamping `hiddenAt`
 * and pinned by stamping `pinnedAt`; legacy rows have neither field, so a bare
 * `{ hiddenAt: null }` misses them. Proved by
 * `chat-message-where.contract.spec.ts`.
 */
export const chatMessageWhere = {
  /** Visible: not hidden — `hiddenAt` null or absent. */
  visible: isUnset('hiddenAt'),
  /** Hidden: `hiddenAt` holds a date. */
  hidden: isPresent('hiddenAt'),
  /** Pinned: `pinnedAt` holds a date. */
  pinned: isPresent('pinnedAt'),
  /**
   * Authored by someone who may still speak: no disabled chat profile and no
   * active ban on any of their identities.
   */
  byAllowedAuthor: {
    user: {
      is: {
        chatUsers: { none: { disabled: true } },
        bannedIdentities: { none: banWhere.active },
      },
    },
  },
} as const satisfies Record<string, Prisma.ChatMessageWhereInput>;

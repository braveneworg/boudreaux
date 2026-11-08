/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { PlaylistActionCode } from '@/lib/types/domain/playlist';

/**
 * The rejection of a playlist mutation whose Server Action answered with a
 * failure: `code` is the fact to branch on, `message` the action's copy, safe
 * to show as written (ADR-0001). Anything else a mutation rejects with — a
 * network failure, a thrown action — is not one of these.
 */
export class PlaylistActionError extends Error {
  constructor(
    public readonly code: PlaylistActionCode,
    message: string
  ) {
    super(message);
    this.name = 'PlaylistActionError';
  }
}

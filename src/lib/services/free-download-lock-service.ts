/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'server-only';

/**
 * In-process lock service for the free-download flow.
 *
 * Prevents the same visitor from initiating two concurrent free-download
 * bundle requests for the same release+format-set, which would otherwise
 * race on the rolling-window cap and double-bill the visitor.
 *
 * Scope: single Node.js process / serverless instance. With multiple
 * replicas the lock is best-effort, but the cap query (driven by
 * `DownloadEvent`) remains the source of truth, so at worst a visitor
 * could obtain one extra successful download in a narrow window.
 *
 * Default TTL: 30 seconds. Locks are GC'd lazily on the next `acquire`.
 *
 * @see specs/007-free-digital-downloads/research.md §R-3
 */
export class FreeDownloadLockService {
  private readonly ttlMs: number;
  private readonly locks: Map<string, number> = new Map();

  constructor(ttlMs = 30_000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Attempt to take the lock for `key`. Returns `true` if the caller now
   * holds the lock; `false` if another caller already does and the entry
   * has not expired.
   */
  acquire(key: string, now: number = Date.now()): boolean {
    this.gc(now);

    const expiresAt = this.locks.get(key);
    if (expiresAt !== undefined && expiresAt > now) {
      return false;
    }

    this.locks.set(key, now + this.ttlMs);
    return true;
  }

  /**
   * Release the lock for `key`. Idempotent — releasing a non-existent or
   * already-expired lock is a no-op.
   */
  release(key: string): void {
    this.locks.delete(key);
  }

  /**
   * Lazily evict expired entries. Called from `acquire`.
   */
  private gc(now: number): void {
    for (const [key, expiresAt] of this.locks) {
      if (expiresAt <= now) {
        this.locks.delete(key);
      }
    }
  }
}

export const freeDownloadLockService = new FreeDownloadLockService();

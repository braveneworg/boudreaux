/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'server-only';

/**
 * The gate's lock seam (ADR-0018): one subject may be inside
 * authorize → produce → commit at a time, so two overlapping requests cannot
 * both read a counter below its cap and both be charged. Production runs one
 * container, so the adapter is in-process; a Mongo compare-and-swap adapter
 * drops in here if that changes.
 */
export interface DownloadLock {
  acquire(key: string, now?: number): boolean;
  release(key: string): void;
}

/**
 * In-process adapter: a per-key expiry map, GC'd lazily on the next
 * `acquire`. Default TTL 30 seconds, above any single download's production
 * time, so a crashed request cannot hold its subject's key for long.
 */
export class InProcessDownloadLock implements DownloadLock {
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

export const inProcessDownloadLock = new InProcessDownloadLock();

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FreeDownloadLockService } from '@/lib/services/free-download-lock-service';

vi.mock('server-only', () => ({}));

describe('FreeDownloadLockService', () => {
  let service: FreeDownloadLockService;

  beforeEach(() => {
    service = new FreeDownloadLockService(30_000);
  });

  it('acquires a fresh key successfully', () => {
    expect(service.acquire('release-1|visitor-a|fmt')).toBe(true);
  });

  it('rejects a second acquire for the same key within TTL', () => {
    const now = 1_000_000;
    expect(service.acquire('k', now)).toBe(true);
    expect(service.acquire('k', now + 1_000)).toBe(false);
    expect(service.acquire('k', now + 29_999)).toBe(false);
  });

  it('allows reacquire after TTL expires', () => {
    const now = 1_000_000;
    expect(service.acquire('k', now)).toBe(true);
    expect(service.acquire('k', now + 30_001)).toBe(true);
  });

  it('release() removes the entry and permits immediate reacquire', () => {
    expect(service.acquire('k')).toBe(true);
    service.release('k');
    expect(service.acquire('k')).toBe(true);
  });

  it('release() of an unknown key is a no-op', () => {
    expect(() => service.release('does-not-exist')).not.toThrow();
  });

  it('does not affect unrelated keys', () => {
    expect(service.acquire('a')).toBe(true);
    expect(service.acquire('b')).toBe(true);
    expect(service.acquire('a')).toBe(false);
    expect(service.acquire('b')).toBe(false);
  });

  it('GCs expired entries lazily on the next acquire', () => {
    const now = 1_000_000;
    expect(service.acquire('expired', now)).toBe(true);
    expect(service.acquire('keeper', now)).toBe(true);

    // Advance past TTL — `expired` is stale, `keeper` is also stale here too;
    // simulate keeper having been refreshed.
    service.release('keeper');
    expect(service.acquire('keeper', now + 35_000)).toBe(true);

    // Next acquire of any key should have GC'd `expired`, freeing it.
    expect(service.acquire('expired', now + 35_000)).toBe(true);
  });

  it('respects a custom TTL passed to the constructor', () => {
    const shortLived = new FreeDownloadLockService(1_000);
    const now = 5_000;
    expect(shortLived.acquire('k', now)).toBe(true);
    expect(shortLived.acquire('k', now + 500)).toBe(false);
    expect(shortLived.acquire('k', now + 1_001)).toBe(true);
  });
});

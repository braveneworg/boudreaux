// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getRequestId, resolveRequestId, runWithRequestContext } from './request-context';

vi.mock('server-only', () => ({}));

describe('request-context', () => {
  describe('runWithRequestContext / getRequestId', () => {
    it('exposes the request id inside the context and not outside', () => {
      expect(getRequestId()).toBeUndefined();

      const seen = runWithRequestContext('req-1', () => getRequestId());

      expect(seen).toBe('req-1');
      expect(getRequestId()).toBeUndefined();
    });

    it('propagates across async boundaries', async () => {
      const seen = await runWithRequestContext('req-async', async () => {
        await Promise.resolve();
        return getRequestId();
      });

      expect(seen).toBe('req-async');
    });

    it('reuses an existing context instead of overwriting it', () => {
      const seen = runWithRequestContext('outer', () =>
        runWithRequestContext('inner', () => getRequestId())
      );

      expect(seen).toBe('outer');
    });
  });

  describe('resolveRequestId', () => {
    it('trusts a well-formed x-request-id header', () => {
      const headers = new Headers({ 'x-request-id': 'abc123DEF-456' });

      expect(resolveRequestId(headers)).toBe('abc123DEF-456');
    });

    it('mints a UUID when the header is missing', () => {
      const id = resolveRequestId(new Headers());

      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('rejects malformed header values (log-injection guard)', () => {
      const headers = new Headers({ 'x-request-id': 'evil id with spaces' });

      const id = resolveRequestId(headers);

      expect(id).not.toContain(' ');
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('rejects oversized header values', () => {
      const headers = new Headers({ 'x-request-id': 'a'.repeat(65) });

      expect(resolveRequestId(headers)).toHaveLength(36);
    });
  });
});

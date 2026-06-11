// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GET } from './route';

const stateFixture = {
  configuredLevel: 'info',
  override: null,
  effectiveLevel: 'info',
  expiresAt: null,
};

vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin:
    (handler: (req: unknown, ctx: unknown, session: unknown) => Promise<Response>) =>
    (req: unknown, ctx: unknown) =>
      handler(req, ctx, { user: { id: 'admin-1', role: 'admin' } }),
}));

vi.mock('@/lib/utils/logger', () => ({
  getLogLevelState: vi.fn(() => stateFixture),
}));

describe('GET /api/admin/log-level', () => {
  it('returns the current log-level state', async () => {
    const response = await GET(undefined as never, undefined as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(stateFixture);
  });
});

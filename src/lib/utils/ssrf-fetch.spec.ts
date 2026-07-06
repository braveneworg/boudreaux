/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { buildPinnedDispatcher, vetHostname } from './ssrf-fetch';

vi.mock('server-only', () => ({}));

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

type DispatcherLookup = (
  hostname: string,
  options: { all?: boolean },
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | { address: string; family: number }[],
    family?: number
  ) => void
) => void;

// Capture the connection lookup installed on the pinned dispatcher. undici is
// mocked so it never invokes the lookup itself — we exercise it directly to
// assert it pins to the vetted address (and to cover both callback forms).
const { capturedLookupRef } = vi.hoisted(() => ({
  capturedLookupRef: { current: undefined as DispatcherLookup | undefined },
}));

vi.mock('undici', () => ({
  // A class (not an arrow) so the util's `new Agent(...)` constructs — arrow
  // functions are not constructable; AGENTS.md routes constructor mocks to a class.
  Agent: class {
    close = vi.fn();
    constructor(opts: { connect?: { lookup?: DispatcherLookup } }) {
      capturedLookupRef.current = opts?.connect?.lookup;
    }
  },
}));

describe('vetHostname', () => {
  beforeEach(() => {
    capturedLookupRef.current = undefined;
  });

  it('returns ok with the vetted address for a public IP', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '1.2.3.4', family: 4 } as never);

    const result = await vetHostname('example.com');

    expect(result).toEqual({ ok: true, address: '1.2.3.4', family: 4 });
  });

  it('returns reason "disallowed" when the resolved IP is private', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '10.0.0.1', family: 4 } as never);

    const result = await vetHostname('internal.example.com');

    expect(result).toEqual({ ok: false, reason: 'disallowed', address: '10.0.0.1' });
  });

  it('returns reason "disallowed" for the cloud metadata address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '169.254.169.254', family: 4 } as never);

    const result = await vetHostname('metadata.example.com');

    expect(result).toEqual({ ok: false, reason: 'disallowed', address: '169.254.169.254' });
  });

  it('returns reason "disallowed" for a private IPv6 unique-local address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: 'fd00::1', family: 6 } as never);

    const result = await vetHostname('v6.example.com');

    expect(result).toEqual({ ok: false, reason: 'disallowed', address: 'fd00::1' });
  });

  it('returns reason "dns_failure" carrying the caught error when lookup throws', async () => {
    const { lookup } = await import('node:dns/promises');
    const dnsError = new Error('ENOTFOUND');
    vi.mocked(lookup).mockRejectedValueOnce(dnsError);

    const result = await vetHostname('does-not-resolve.example.com');

    expect(result).toEqual({ ok: false, reason: 'dns_failure', error: dnsError });
  });
});

describe('buildPinnedDispatcher', () => {
  it('pins the lookup to the vetted address in the single-result callback form', () => {
    buildPinnedDispatcher('1.2.3.4', 4);

    const lookup = capturedLookupRef.current;
    if (typeof lookup !== 'function') {
      throw new Error('dispatcher lookup was not captured');
    }
    const callback = vi.fn();
    lookup('example.com', { all: false }, callback);

    expect(callback).toHaveBeenCalledWith(null, '1.2.3.4', 4);
  });

  it('pins the lookup to a single-element list in the all callback form', () => {
    buildPinnedDispatcher('5.6.7.8', 4);

    const lookup = capturedLookupRef.current;
    if (typeof lookup !== 'function') {
      throw new Error('dispatcher lookup was not captured');
    }
    const callback = vi.fn();
    lookup('example.com', { all: true }, callback);

    expect(callback).toHaveBeenCalledWith(null, [{ address: '5.6.7.8', family: 4 }]);
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { lookup } from 'node:dns/promises';

import { isDisallowedAddress, isPubliclyRoutableUrl } from './ip-guard';

vi.mock('server-only', () => ({}));

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

describe('isDisallowedAddress', () => {
  it('blocks the link-local metadata address', () => {
    expect(isDisallowedAddress('169.254.169.254')).toBe(true);
  });

  it('blocks loopback', () => {
    expect(isDisallowedAddress('127.0.0.1')).toBe(true);
  });

  it('blocks the unspecified 0.0.0.0 address', () => {
    expect(isDisallowedAddress('0.0.0.0')).toBe(true);
  });

  it('blocks a 10/8 private address', () => {
    expect(isDisallowedAddress('10.0.0.1')).toBe(true);
  });

  it('blocks a 172.16/12 private address', () => {
    expect(isDisallowedAddress('172.16.0.1')).toBe(true);
  });

  it('blocks a 192.168/16 private address', () => {
    expect(isDisallowedAddress('192.168.0.1')).toBe(true);
  });

  it('blocks a CGNAT (100.64/10) address', () => {
    expect(isDisallowedAddress('100.64.0.1')).toBe(true);
  });

  it('blocks a multicast address', () => {
    expect(isDisallowedAddress('224.0.0.1')).toBe(true);
  });

  it('allows a public IPv4 address', () => {
    expect(isDisallowedAddress('93.184.216.34')).toBe(false);
  });

  it('blocks IPv6 loopback', () => {
    expect(isDisallowedAddress('::1')).toBe(true);
  });

  it('blocks the IPv6 unspecified address', () => {
    expect(isDisallowedAddress('::')).toBe(true);
  });

  it('blocks an IPv6 link-local (fe80::/10) address', () => {
    expect(isDisallowedAddress('fe80::1')).toBe(true);
  });

  it('blocks an IPv6 link-local address in the fe9x block', () => {
    expect(isDisallowedAddress('fe90::1')).toBe(true);
  });

  it('blocks an IPv6 link-local address in the feax block', () => {
    expect(isDisallowedAddress('fea0::1')).toBe(true);
  });

  it('blocks an IPv6 link-local address in the febx block', () => {
    expect(isDisallowedAddress('feb0::1')).toBe(true);
  });

  it('blocks an IPv6 unique-local (fc00::/7) address', () => {
    expect(isDisallowedAddress('fc00::1')).toBe(true);
  });

  it('blocks an IPv6 unique-local address in the fd block', () => {
    expect(isDisallowedAddress('fd00::1')).toBe(true);
  });

  it('blocks an IPv4-mapped IPv6 private address', () => {
    expect(isDisallowedAddress('::ffff:10.0.0.1')).toBe(true);
  });

  it('blocks an IPv4-mapped IPv6 address with a non-IP tail', () => {
    expect(isDisallowedAddress('::ffff:not-an-ip')).toBe(true);
  });

  it('allows an IPv4-mapped IPv6 public address', () => {
    expect(isDisallowedAddress('::ffff:93.184.216.34')).toBe(false);
  });

  it('allows a public IPv6 address', () => {
    expect(isDisallowedAddress('2001:db8::1')).toBe(false);
  });

  it('blocks non-IP input', () => {
    expect(isDisallowedAddress('not-an-ip')).toBe(true);
  });
});

describe('isPubliclyRoutableUrl', () => {
  it('rejects a url resolving to a private address', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '10.0.0.5', family: 4 } as never);

    expect(await isPubliclyRoutableUrl('https://internal.example/img.jpg')).toBe(false);
  });

  it('accepts a url resolving to a public address', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '93.184.216.34', family: 4 } as never);

    expect(await isPubliclyRoutableUrl('https://example.com/img.jpg')).toBe(true);
  });

  it('accepts a plain http url resolving to a public address', async () => {
    vi.mocked(lookup).mockResolvedValue({ address: '93.184.216.34', family: 4 } as never);

    expect(await isPubliclyRoutableUrl('http://example.com/img.jpg')).toBe(true);
  });

  it('rejects a non-http scheme', async () => {
    expect(await isPubliclyRoutableUrl('file:///etc/passwd')).toBe(false);
  });

  it('does not perform a dns lookup for a non-http scheme', async () => {
    await isPubliclyRoutableUrl('ftp://example.com/img.jpg');

    expect(vi.mocked(lookup)).not.toHaveBeenCalled();
  });

  it('rejects an unparseable url', async () => {
    expect(await isPubliclyRoutableUrl('not a url')).toBe(false);
  });

  it('rejects when dns lookup fails', async () => {
    vi.mocked(lookup).mockRejectedValue(new Error('ENOTFOUND'));

    expect(await isPubliclyRoutableUrl('https://nope.example/x.jpg')).toBe(false);
  });
});

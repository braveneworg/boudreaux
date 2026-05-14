/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NextRequest } from 'next/server';

import { extractClientIp, extractClientIpFromHeaders } from './extract-client-ip';

vi.mock('server-only', () => ({}));

const buildHeaders = (entries: Record<string, string>) => new Headers(entries);

describe('extractClientIpFromHeaders', () => {
  it('returns x-real-ip when present', () => {
    const headers = buildHeaders({ 'x-real-ip': '203.0.113.5' });
    expect(extractClientIpFromHeaders(headers)).toBe('203.0.113.5');
  });

  it('prefers x-real-ip over x-forwarded-for to prevent spoofing', () => {
    const headers = buildHeaders({
      'x-real-ip': '203.0.113.5',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    });
    expect(extractClientIpFromHeaders(headers)).toBe('203.0.113.5');
  });

  it('falls back to first x-forwarded-for entry when x-real-ip is absent', () => {
    const headers = buildHeaders({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(extractClientIpFromHeaders(headers)).toBe('1.2.3.4');
  });

  it('trims whitespace from the chosen x-forwarded-for entry', () => {
    const headers = buildHeaders({ 'x-forwarded-for': '   9.9.9.9   , 5.5.5.5' });
    expect(extractClientIpFromHeaders(headers)).toBe('9.9.9.9');
  });

  it('returns "anonymous" when neither header is set', () => {
    const headers = buildHeaders({});
    expect(extractClientIpFromHeaders(headers)).toBe('anonymous');
  });

  it('returns "anonymous" when x-forwarded-for is empty', () => {
    const headers = buildHeaders({ 'x-forwarded-for': '' });
    expect(extractClientIpFromHeaders(headers)).toBe('anonymous');
  });
});

describe('extractClientIp', () => {
  it('delegates to extractClientIpFromHeaders with the request headers', () => {
    const request = {
      headers: buildHeaders({ 'x-real-ip': '198.51.100.7' }),
    } as unknown as NextRequest;

    expect(extractClientIp(request)).toBe('198.51.100.7');
  });

  it('returns "anonymous" when the request has no IP headers', () => {
    const request = { headers: buildHeaders({}) } as unknown as NextRequest;
    expect(extractClientIp(request)).toBe('anonymous');
  });
});

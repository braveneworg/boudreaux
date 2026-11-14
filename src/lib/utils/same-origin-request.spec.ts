/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isSameOriginRequest } from './same-origin-request';

vi.mock('server-only', () => ({}));

const from = (headers: Record<string, string>): { get: (name: string) => string | null } => {
  const all = new Headers(headers);

  return { get: (name) => all.get(name) };
};

describe('isSameOriginRequest', () => {
  it('is true when the browser says the request came from this origin', () => {
    expect(isSameOriginRequest(from({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });

  it.each(['cross-site', 'same-site', 'none'])(
    'is false when the browser says it is %s',
    (site) => {
      expect(isSameOriginRequest(from({ 'sec-fetch-site': site }))).toBe(false);
    }
  );

  it('believes the browser over an Origin that matches', () => {
    expect(
      isSameOriginRequest(
        from({
          'sec-fetch-site': 'cross-site',
          origin: 'https://fakefourrecords.com',
          host: 'fakefourrecords.com',
        })
      )
    ).toBe(false);
  });

  it('falls back to an Origin whose host is the host the request was sent to', () => {
    expect(
      isSameOriginRequest(
        from({ origin: 'https://www.fakefourrecords.com', host: 'www.fakefourrecords.com' })
      )
    ).toBe(true);
  });

  it('reads the host the proxy forwarded before the one it connected with', () => {
    expect(
      isSameOriginRequest(
        from({
          origin: 'https://fakefourrecords.com',
          'x-forwarded-host': 'fakefourrecords.com',
          host: 'app:3000',
        })
      )
    ).toBe(true);
  });

  it('is false for an Origin on another host', () => {
    expect(
      isSameOriginRequest(from({ origin: 'https://evil.example', host: 'fakefourrecords.com' }))
    ).toBe(false);
  });

  it('is false for an Origin that is not a URL', () => {
    expect(isSameOriginRequest(from({ origin: 'null', host: 'fakefourrecords.com' }))).toBe(false);
  });

  it('is false when the request says nothing about where it came from', () => {
    expect(isSameOriginRequest(from({ host: 'fakefourrecords.com' }))).toBe(false);
  });

  it('is false for an Origin with no host to compare it to', () => {
    expect(isSameOriginRequest(from({ origin: 'https://fakefourrecords.com' }))).toBe(false);
  });
});

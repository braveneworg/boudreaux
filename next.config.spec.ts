/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import config from './next.config';

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

const headerRules = async (): Promise<HeaderRule[]> => (await config.headers()) as HeaderRule[];

describe('next.config headers', () => {
  it('sets no Access-Control-Allow-Origin, leaving CDN asset CORS to the S3 bucket rule', async () => {
    const corsHeaders = (await headerRules()).flatMap(({ headers }) =>
      headers.filter(({ key }) => key.toLowerCase() === 'access-control-allow-origin')
    );

    expect(corsHeaders).toEqual([]);
  });

  it('adds no header rule for /_next/static, whose cache headers Next.js owns', async () => {
    const sources = (await headerRules()).map(({ source }) => source);

    expect(sources).not.toContain('/_next/static/:path*');
  });

  it('still sends the security headers on every route', async () => {
    const catchAll = (await headerRules()).find(({ source }) => source === '/(.*)');

    expect(catchAll?.headers.map(({ key }) => key)).toEqual(
      expect.arrayContaining([
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Strict-Transport-Security',
        'Content-Security-Policy',
      ])
    );
  });
});

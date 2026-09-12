/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guard for the production reverse-proxy config. nginx.conf is baked into the
 * nginx image at deploy time and never exercised by CI E2E (which talks to the
 * standalone server directly), so routing regressions only surface in prod.
 *
 * The regression this guards against: the OAuth callback
 * (`/api/auth/callback/<provider>`) once sat behind a 5-requests-per-minute
 * per-IP zone. Apple's `form_post` callback costs two hits (POST, then a 302
 * to the same URL as GET), so any two sign-ins inside a minute produced a
 * bare nginx 429 and both Google and Apple sign-in failed.
 */

type LocationModifier = '' | '=' | '^~' | '~' | '~*';

interface LocationBlock {
  body: string;
  modifier: LocationModifier;
  pattern: string;
}

const CONFIG_PATH = join(__dirname, 'nginx.conf');
const CONFIG = readFileSync(CONFIG_PATH, 'utf8');

const LOCATION_MODIFIERS: readonly LocationModifier[] = ['=', '^~', '~', '~*'];

const isLocationModifier = (token: string): token is LocationModifier =>
  LOCATION_MODIFIERS.includes(token as LocationModifier);

const countOccurrences = (line: string, character: string): number =>
  line.split(character).length - 1;

/** `location [modifier] pattern {` → header parts, or undefined for any other line. */
const parseLocationHeader = (
  line: string
): Pick<LocationBlock, 'modifier' | 'pattern'> | undefined => {
  const tokens = line.trim().split(/\s+/);

  if (tokens[0] !== 'location' || tokens.at(-1) !== '{') {
    return undefined;
  }

  const [, second = '', third = ''] = tokens;

  return isLocationModifier(second)
    ? { modifier: second, pattern: third }
    : { modifier: '', pattern: second };
};

/** The `server { … }` block that serves the real app over HTTPS. */
const readAppServerBlock = (source: string): string => {
  const servers = source.split(/^server\s*\{/m).slice(1);
  const appServer = servers.find(
    (server) =>
      server.includes('listen 443 ssl;') && server.includes('server_name fakefourrecords.com')
  );

  if (appServer === undefined) {
    throw new Error(`No HTTPS app server block found in ${CONFIG_PATH}`);
  }

  return appServer;
};

/**
 * Line-oriented scan: a `location … {` line opens a block, brace depth tracks
 * nesting, and the block closes when depth returns to zero.
 */
const parseLocations = (serverBlock: string): LocationBlock[] => {
  const locations: LocationBlock[] = [];
  let open: { block: LocationBlock; depth: number } | undefined;

  for (const line of serverBlock.split('\n')) {
    if (open === undefined) {
      const header = parseLocationHeader(line);

      if (header !== undefined) {
        open = { block: { ...header, body: '' }, depth: 1 };
      }

      continue;
    }

    open.depth += countOccurrences(line, '{') - countOccurrences(line, '}');

    if (open.depth === 0) {
      locations.push(open.block);
      open = undefined;
    } else {
      open.block.body += `${line}\n`;
    }
  }

  return locations;
};

const isPrefixLocation = ({ modifier }: LocationBlock): boolean =>
  modifier === '' || modifier === '^~';

const isRegexLocation = ({ modifier }: LocationBlock): boolean =>
  modifier === '~' || modifier === '~*';

/** nginx location regexes are PCRE; the ones in this file are JS-compatible. */
const regexMatches = ({ modifier, pattern }: LocationBlock, path: string): boolean =>
  new RegExp(pattern, modifier === '~*' ? 'i' : '').test(path);

const longestPrefixMatch = (locations: LocationBlock[], path: string): LocationBlock | undefined =>
  locations
    .filter(isPrefixLocation)
    .filter(({ pattern }) => path.startsWith(pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];

/**
 * Resolve `path` the way nginx picks a location: an exact `=` match wins; the
 * longest prefix wins outright when it is `^~`; otherwise the first matching
 * regex location (in file order) wins; else the longest prefix.
 */
const resolveLocation = (locations: LocationBlock[], path: string): LocationBlock | undefined => {
  const exact = locations.find(({ modifier, pattern }) => modifier === '=' && pattern === path);

  if (exact !== undefined) {
    return exact;
  }

  const prefix = longestPrefixMatch(locations, path);

  if (prefix?.modifier === '^~') {
    return prefix;
  }

  const regex = locations.filter(isRegexLocation).find((location) => regexMatches(location, path));

  return regex ?? prefix;
};

const appLocations = parseLocations(readAppServerBlock(CONFIG));

const OAUTH_CALLBACK_PATHS = ['/api/auth/callback/google', '/api/auth/callback/apple'] as const;

describe('nginx.conf rate-limit zones', () => {
  it('defines no strict `auth` zone', () => {
    expect(CONFIG).not.toMatch(/zone=auth[\s:]/);
  });

  it('keeps the general /api/ zone defined', () => {
    expect(CONFIG).toMatch(/limit_req_zone \$binary_remote_addr zone=api:/);
  });
});

describe('nginx.conf OAuth callback routing', () => {
  it.each(OAUTH_CALLBACK_PATHS)('%s is served by the general /api/ prefix location', (path) => {
    const location = resolveLocation(appLocations, path);

    expect(location).toMatchObject({ modifier: '', pattern: '/api/' });
  });

  it.each(OAUTH_CALLBACK_PATHS)('%s is limited only by the general api zone', (path) => {
    const location = resolveLocation(appLocations, path);

    expect(location?.body).toMatch(/limit_req zone=api\b/);
  });

  it.each(OAUTH_CALLBACK_PATHS)('%s is captured by no regex location', (path) => {
    const captors = appLocations
      .filter(isRegexLocation)
      .filter((location) => regexMatches(location, path))
      .map(({ pattern }) => pattern);

    expect(captors).toEqual([]);
  });
});

describe('nginx.conf location resolver (parser sanity)', () => {
  it('sees the exact-match Stripe webhook location', () => {
    const location = resolveLocation(appLocations, '/api/stripe/webhook');

    expect(location).toMatchObject({ modifier: '=', pattern: '/api/stripe/webhook' });
  });

  it('sees the regex bundle-download location ahead of the /api/ prefix', () => {
    const location = resolveLocation(appLocations, '/api/releases/abc123/download/bundle');

    expect(location?.modifier).toBe('~');
  });

  it('sees the upload prefix location', () => {
    const location = resolveLocation(appLocations, '/api/tracks/metadata');

    expect(location?.body).toMatch(/limit_req zone=upload\b/);
  });

  it('falls back to the catch-all location for pages', () => {
    const location = resolveLocation(appLocations, '/releases');

    expect(location).toMatchObject({ modifier: '', pattern: '/' });
  });
});

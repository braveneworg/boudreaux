/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  buildCdnUrl,
  buildS3Key,
  isDataUri,
  parseArgs,
  parseDataUri,
} from './backfill-coverart-urls';

describe('parseArgs', () => {
  it('defaults to dry-run, all models, concurrency 3, invalidate enabled', () => {
    const o = parseArgs([]);
    expect(o.execute).toBe(false);
    expect(o.limit).toBeNull();
    expect(o.concurrency).toBe(3);
    expect(o.models).toEqual(['release', 'featured-artist']);
    expect(o.invalidate).toBe(true);
    expect(o.help).toBe(false);
  });

  it('parses --execute', () => {
    expect(parseArgs(['--execute']).execute).toBe(true);
  });

  it('parses --limit N', () => {
    expect(parseArgs(['--limit', '25']).limit).toBe(25);
  });

  it('ignores invalid --limit values', () => {
    expect(parseArgs(['--limit', 'not-a-number']).limit).toBeNull();
    expect(parseArgs(['--limit', '0']).limit).toBeNull();
  });

  it('parses --concurrency N', () => {
    expect(parseArgs(['--concurrency', '8']).concurrency).toBe(8);
  });

  it('parses --model release', () => {
    expect(parseArgs(['--model', 'release']).models).toEqual(['release']);
  });

  it('parses --model featured-artist', () => {
    expect(parseArgs(['--model', 'featured-artist']).models).toEqual(['featured-artist']);
  });

  it('parses --model all', () => {
    expect(parseArgs(['--model', 'all']).models).toEqual(['release', 'featured-artist']);
  });

  it('parses --no-invalidate', () => {
    expect(parseArgs(['--no-invalidate']).invalidate).toBe(false);
  });

  it('parses --help and -h', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });
});

describe('isDataUri', () => {
  it('returns true for data: prefixed strings', () => {
    expect(isDataUri('data:image/jpeg;base64,AAAA')).toBe(true);
  });

  it('returns false for URLs', () => {
    expect(isDataUri('https://cdn.fakefourrecords.com/x.jpg')).toBe(false);
  });

  it('returns false for null/undefined/empty', () => {
    expect(isDataUri(null)).toBe(false);
    expect(isDataUri(undefined)).toBe(false);
    expect(isDataUri('')).toBe(false);
  });
});

describe('parseDataUri', () => {
  it('decodes a valid base64 data URI', () => {
    // "hi" base64 = "aGk="
    const out = parseDataUri('data:image/jpeg;base64,aGk=');
    expect(out?.mimeType).toBe('image/jpeg');
    expect(out?.buffer.toString('utf-8')).toBe('hi');
  });

  it('returns null for unparseable input', () => {
    expect(parseDataUri('not a data uri')).toBeNull();
    expect(parseDataUri('data:image/jpeg,not-base64-marker')).toBeNull();
  });

  it('returns null when the payload is not valid base64', () => {
    // Regex rejects non-base64 chars (like "!")
    expect(parseDataUri('data:image/png;base64,!!!!')).toBeNull();
  });
});

describe('buildS3Key', () => {
  it('returns a backfill-prefixed key under the coverart folder', () => {
    expect(buildS3Key('release', 'abc123', 'jpg')).toBe(
      'media/releases/coverart/backfill-release-abc123.jpg'
    );
    expect(buildS3Key('featured-artist', 'xyz', 'png')).toBe(
      'media/releases/coverart/backfill-featured-artist-xyz.png'
    );
  });
});

describe('buildCdnUrl', () => {
  it('joins domain and key with a single slash', () => {
    expect(buildCdnUrl('https://cdn.example.com', 'media/x.jpg')).toBe(
      'https://cdn.example.com/media/x.jpg'
    );
  });

  it('strips trailing slashes on the domain', () => {
    expect(buildCdnUrl('https://cdn.example.com///', 'media/x.jpg')).toBe(
      'https://cdn.example.com/media/x.jpg'
    );
  });
});

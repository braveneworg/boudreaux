/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { extractProbePrefillTags, type ProbePrefillTags } from './probe-tags';

/** All-null sentinel for junk-input assertions. */
const NULL_TAGS: ProbePrefillTags = {
  title: null,
  artist: null,
  releasedOn: null,
  description: null,
  durationSeconds: null,
};

describe('extractProbePrefillTags', () => {
  // ── Case 1: Lowercase MP4-style tags ────────────────────────────────────
  it('extracts all fields from lowercase MP4-style tags', () => {
    const raw = {
      format: {
        duration: '245.000000',
        tags: {
          title: 'My Song',
          artist: 'The Band',
          date: '2023-06-15',
          comment: 'Live performance',
        },
      },
    };
    expect(extractProbePrefillTags(raw)).toEqual<ProbePrefillTags>({
      title: 'My Song',
      artist: 'The Band',
      releasedOn: '2023-06-15',
      description: 'Live performance',
      durationSeconds: 245,
    });
  });

  // ── Case 2: Uppercase Matroska tags ─────────────────────────────────────
  it('extracts fields case-insensitively from Matroska uppercase tags', () => {
    const raw = {
      format: {
        duration: '180.500000',
        tags: {
          TITLE: 'Matroska Track',
          ARTIST: 'MKV Artist',
          DATE: '2021-03-20',
          COMMENT: 'Festival recording',
        },
      },
    };
    expect(extractProbePrefillTags(raw)).toEqual<ProbePrefillTags>({
      title: 'Matroska Track',
      artist: 'MKV Artist',
      releasedOn: '2021-03-20',
      description: 'Festival recording',
      durationSeconds: 181,
    });
  });

  // ── Case 3: Fallbacks — album_artist and description ────────────────────
  it('falls back to album_artist when artist is absent', () => {
    const raw = {
      format: {
        duration: '120.000000',
        tags: {
          title: 'Solo Work',
          album_artist: 'The Album Artist',
          date: '2020-01-01',
        },
      },
    };
    const result = extractProbePrefillTags(raw);
    expect(result.artist).toBe('The Album Artist');
  });

  it('falls back to description tag when comment is absent', () => {
    const raw = {
      format: {
        duration: '120.000000',
        tags: {
          title: 'Track',
          description: 'A description fallback',
        },
      },
    };
    const result = extractProbePrefillTags(raw);
    expect(result.description).toBe('A description fallback');
  });

  it('falls back to description tag when comment is absent (uppercase)', () => {
    const raw = {
      format: {
        duration: '120.000000',
        tags: {
          TITLE: 'Track',
          DESCRIPTION: 'Uppercase description',
        },
      },
    };
    const result = extractProbePrefillTags(raw);
    expect(result.description).toBe('Uppercase description');
  });

  // ── Case 4: creation_time / quicktime date must NOT become releasedOn ───
  it('returns releasedOn: null when only creation_time is present', () => {
    const raw = {
      format: {
        duration: '60.000000',
        tags: {
          creation_time: '2024-01-15T10:30:00.000000Z',
        },
      },
    };
    expect(extractProbePrefillTags(raw).releasedOn).toBeNull();
  });

  it('returns releasedOn: null when only com.apple.quicktime.creationdate is present', () => {
    const raw = {
      format: {
        duration: '60.000000',
        tags: {
          'com.apple.quicktime.creationdate': '2024-01-15T10:30:00.000000Z',
        },
      },
    };
    expect(extractProbePrefillTags(raw).releasedOn).toBeNull();
  });

  it('returns releasedOn: null when only both encode-time tags are present', () => {
    const raw = {
      format: {
        duration: '60.000000',
        tags: {
          creation_time: '2024-01-15T10:30:00.000000Z',
          'com.apple.quicktime.creationdate': '2024-01-15T10:30:00.000000Z',
        },
      },
    };
    expect(extractProbePrefillTags(raw).releasedOn).toBeNull();
  });

  // ── Case 5: date parsing ─────────────────────────────────────────────────
  it('parses bare year "2019" to "2019-01-01"', () => {
    const raw = {
      format: { duration: '100.0', tags: { date: '2019' } },
    };
    expect(extractProbePrefillTags(raw).releasedOn).toBe('2019-01-01');
  });

  it('parses full date "2019-08-01" to "2019-08-01"', () => {
    const raw = {
      format: { duration: '100.0', tags: { date: '2019-08-01' } },
    };
    expect(extractProbePrefillTags(raw).releasedOn).toBe('2019-08-01');
  });

  it('returns releasedOn: null for unparseable date string', () => {
    const raw = {
      format: { duration: '100.0', tags: { date: 'not-a-date' } },
    };
    expect(extractProbePrefillTags(raw).releasedOn).toBeNull();
  });

  // ── Case 6: duration parsing ─────────────────────────────────────────────
  it('parses duration "245.000000" to 245', () => {
    const raw = {
      format: { duration: '245.000000', tags: {} },
    };
    expect(extractProbePrefillTags(raw).durationSeconds).toBe(245);
  });

  it('returns durationSeconds: null for "0"', () => {
    const raw = { format: { duration: '0', tags: {} } };
    expect(extractProbePrefillTags(raw).durationSeconds).toBeNull();
  });

  it('returns durationSeconds: null for "-3"', () => {
    const raw = { format: { duration: '-3', tags: {} } };
    expect(extractProbePrefillTags(raw).durationSeconds).toBeNull();
  });

  it('returns durationSeconds: null for "abc"', () => {
    const raw = { format: { duration: 'abc', tags: {} } };
    expect(extractProbePrefillTags(raw).durationSeconds).toBeNull();
  });

  it('returns durationSeconds: null when duration is absent', () => {
    const raw = { format: { tags: {} } };
    expect(extractProbePrefillTags(raw).durationSeconds).toBeNull();
  });

  // ── Case 7: junk / degenerate input shapes ───────────────────────────────
  it('returns all-null for null input', () => {
    expect(extractProbePrefillTags(null)).toEqual(NULL_TAGS);
  });

  it('returns all-null for string input', () => {
    expect(extractProbePrefillTags('not-an-object')).toEqual(NULL_TAGS);
  });

  it('returns all-null for empty object {}', () => {
    expect(extractProbePrefillTags({})).toEqual(NULL_TAGS);
  });

  it('returns all-null when format is a string', () => {
    expect(extractProbePrefillTags({ format: 'nope' })).toEqual(NULL_TAGS);
  });

  it('returns all-null when format.tags is a string', () => {
    expect(extractProbePrefillTags({ format: { tags: 'nope' } })).toEqual(NULL_TAGS);
  });

  // ── Case 8: empty-string tag values count as absent ──────────────────────
  it('treats empty-string tag values as null', () => {
    const raw = {
      format: {
        duration: '100.0',
        tags: {
          title: '',
          artist: '',
          date: '',
          comment: '',
        },
      },
    };
    expect(extractProbePrefillTags(raw)).toEqual<ProbePrefillTags>({
      title: null,
      artist: null,
      releasedOn: null,
      description: null,
      durationSeconds: 100,
    });
  });

  it('treats numeric tag values as absent (null)', () => {
    const raw = {
      format: {
        tags: {
          title: 42,
          artist: 0,
        },
      },
    };
    const result = extractProbePrefillTags(raw);
    expect(result.title).toBeNull();
    expect(result.artist).toBeNull();
  });
});

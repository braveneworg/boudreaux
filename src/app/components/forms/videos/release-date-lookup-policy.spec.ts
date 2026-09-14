/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  classifyLookupResult,
  createLookupBudget,
  isLookupBudgetExhausted,
  lookupPairKey,
  nextAttemptDelayMs,
  recordLookupAttempt,
  RELEASE_DATE_LOOKUP_DELAYS_MS,
  shouldLookupReleaseDate,
  type ReleaseDateLookupGate,
} from './release-date-lookup-policy';

describe('shouldLookupReleaseDate', () => {
  const base: ReleaseDateLookupGate = {
    uploadStatus: 'uploading',
    hasPersistedRow: false,
    category: 'MUSIC',
    title: 'My Bad',
    artist: 'Ceschi',
    releasedOn: '',
  };

  it('opens once the upload has started', () => {
    expect(shouldLookupReleaseDate(base)).toBe(true);
  });

  it('opens once the upload has succeeded', () => {
    expect(shouldLookupReleaseDate({ ...base, uploadStatus: 'success' })).toBe(true);
  });

  it('stays closed while the file is still being prepared', () => {
    expect(shouldLookupReleaseDate({ ...base, uploadStatus: 'preparing' })).toBe(false);
  });

  it('stays closed before any file is chosen', () => {
    expect(shouldLookupReleaseDate({ ...base, uploadStatus: 'idle' })).toBe(false);
  });

  it('opens on edit-open with a persisted row even before any upload', () => {
    expect(shouldLookupReleaseDate({ ...base, uploadStatus: 'idle', hasPersistedRow: true })).toBe(
      true
    );
  });

  it('never opens for an informational video', () => {
    expect(shouldLookupReleaseDate({ ...base, category: 'INFORMATIONAL' })).toBe(false);
  });

  it('never opens when a release date is already set', () => {
    expect(shouldLookupReleaseDate({ ...base, releasedOn: '2019-08-04' })).toBe(false);
  });

  it('needs a title', () => {
    expect(shouldLookupReleaseDate({ ...base, title: '   ' })).toBe(false);
  });

  it('needs an artist', () => {
    expect(shouldLookupReleaseDate({ ...base, artist: '' })).toBe(false);
  });

  it('tolerates undefined fields', () => {
    expect(
      shouldLookupReleaseDate({
        ...base,
        title: undefined,
        artist: undefined,
        releasedOn: undefined,
        category: undefined,
      })
    ).toBe(false);
  });
});

describe('lookupPairKey', () => {
  it('trims and lowercases both halves', () => {
    expect(lookupPairKey('  My Bad ', 'CESCHI')).toBe(lookupPairKey('my bad', 'ceschi'));
  });

  it('distinguishes title from artist', () => {
    expect(lookupPairKey('a', 'b')).not.toBe(lookupPairKey('b', 'a'));
  });

  it('distinguishes different pairs', () => {
    expect(lookupPairKey('a', 'b')).not.toBe(lookupPairKey('a', 'c'));
  });
});

describe('lookup budget', () => {
  it('spaces the attempts as immediate, then 20s, then 60s', () => {
    expect(RELEASE_DATE_LOOKUP_DELAYS_MS).toEqual([0, 20_000, 60_000]);
  });

  it('walks the delays as attempts are recorded, then reports none left', () => {
    let budget = createLookupBudget();
    const delays: Array<number | null> = [nextAttemptDelayMs(budget)];
    budget = recordLookupAttempt(budget);
    delays.push(nextAttemptDelayMs(budget));
    budget = recordLookupAttempt(budget);
    delays.push(nextAttemptDelayMs(budget));
    budget = recordLookupAttempt(budget);
    delays.push(nextAttemptDelayMs(budget));

    expect(delays).toEqual([0, 20_000, 60_000, null]);
  });

  it('is exhausted after three recorded attempts', () => {
    const budget = recordLookupAttempt(
      recordLookupAttempt(recordLookupAttempt(createLookupBudget()))
    );

    expect(isLookupBudgetExhausted(budget)).toBe(true);
  });

  it('is not exhausted after two recorded attempts', () => {
    const budget = recordLookupAttempt(recordLookupAttempt(createLookupBudget()));

    expect(isLookupBudgetExhausted(budget)).toBe(false);
  });

  it('does not mutate the budget it is given', () => {
    const budget = createLookupBudget();
    recordLookupAttempt(budget);

    expect(budget.attempts).toBe(0);
  });
});

describe('classifyLookupResult', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  it('classifies a past day as found', () => {
    expect(classifyLookupResult({ releasedOn: '2020-06-01' }, now)).toEqual({
      kind: 'found',
      releasedOn: '2020-06-01',
    });
  });

  it('classifies null as a miss', () => {
    expect(classifyLookupResult(null, now)).toEqual({ kind: 'miss' });
  });

  it('classifies undefined as a miss', () => {
    expect(classifyLookupResult(undefined, now)).toEqual({ kind: 'miss' });
  });

  // Client double-guard of the server rule: today is never a release date.
  it("classifies today's UTC day as a miss", () => {
    expect(classifyLookupResult({ releasedOn: '2026-09-14' }, now)).toEqual({ kind: 'miss' });
  });

  it('classifies yesterday as found', () => {
    expect(classifyLookupResult({ releasedOn: '2026-09-13' }, now)).toEqual({
      kind: 'found',
      releasedOn: '2026-09-13',
    });
  });

  it('classifies a non-calendar day as a miss', () => {
    expect(classifyLookupResult({ releasedOn: '2021-02-30' }, now)).toEqual({ kind: 'miss' });
  });

  it('classifies an ISO datetime as a miss', () => {
    expect(classifyLookupResult({ releasedOn: '2020-06-01T00:00:00.000Z' }, now)).toEqual({
      kind: 'miss',
    });
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ENV_MANIFEST,
  FEATURE_GROUPS,
  evaluateFeatureGroup,
  featureGroupMembers,
  presentEnvNames,
  type FeatureGroupSpec,
} from './env-manifest';

const pair: FeatureGroupSpec = { id: 'google', feature: 'Pair', requires: ['A_ID', 'A_SECRET'] };

const withAlternatives: FeatureGroupSpec = {
  id: 'apple',
  feature: 'Alternatives',
  requires: ['B_ID'],
  oneOf: [['B_TEAM', 'B_KEY', 'B_PEM'], ['B_STATIC']],
};

describe('evaluateFeatureGroup', () => {
  it('is enabled when every required name is set', () => {
    expect(evaluateFeatureGroup(pair, new Set(['A_ID', 'A_SECRET']))).toEqual({
      id: 'google',
      feature: 'Pair',
      state: 'enabled',
      missing: [],
    });
  });

  it('is disabled when none of its names is set', () => {
    expect(evaluateFeatureGroup(pair, new Set(['OTHER']))).toMatchObject({
      state: 'disabled',
      missing: ['A_ID', 'A_SECRET'],
    });
  });

  it('is half-set when one name of a pair is set', () => {
    expect(evaluateFeatureGroup(pair, new Set(['A_ID']))).toMatchObject({
      state: 'half-set',
      missing: ['A_SECRET'],
    });
  });

  it('is enabled through either alternative', () => {
    expect(evaluateFeatureGroup(withAlternatives, new Set(['B_ID', 'B_STATIC'])).state).toBe(
      'enabled'
    );
    expect(
      evaluateFeatureGroup(withAlternatives, new Set(['B_ID', 'B_TEAM', 'B_KEY', 'B_PEM'])).state
    ).toBe('enabled');
  });

  it('is half-set when the required name is set but no alternative is complete', () => {
    expect(evaluateFeatureGroup(withAlternatives, new Set(['B_ID', 'B_TEAM']))).toMatchObject({
      state: 'half-set',
      missing: ['B_STATIC'],
    });
  });

  it('is half-set when an alternative is complete but the required name is not set', () => {
    expect(evaluateFeatureGroup(withAlternatives, new Set(['B_STATIC']))).toMatchObject({
      state: 'half-set',
      missing: ['B_ID'],
    });
  });
});

describe('presentEnvNames', () => {
  it('keeps names with a value and drops empty, blank and undefined ones', () => {
    expect(presentEnvNames({ SET: 'x', EMPTY: '', BLANK: '  ', UNSET: undefined })).toEqual(
      new Set(['SET'])
    );
  });
});

describe('the manifest', () => {
  const byName = new Map(ENV_MANIFEST.map((spec) => [spec.name, spec]));

  it('declares every feature-group member as an optional runtime value', () => {
    const wrong = FEATURE_GROUPS.flatMap(featureGroupMembers).filter((name) => {
      const spec = byName.get(name);
      return spec?.phase !== 'runtime' || spec.requirement !== 'optional';
    });

    expect(wrong).toEqual([]);
  });

  it('gives every feature group a distinct id', () => {
    expect(new Set(FEATURE_GROUPS.map(({ id }) => id)).size).toBe(FEATURE_GROUPS.length);
  });

  it('marks local values optional', () => {
    expect(
      ENV_MANIFEST.filter(
        ({ phase, requirement }) => phase === 'local' && requirement !== 'optional'
      )
    ).toEqual([]);
  });
});

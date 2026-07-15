/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  analyzePlan,
  classifyPlan,
  collectStages,
  matchesKeyPrefix,
  TARGETS,
} from './check-query-plans';

vi.mock('@prisma/client', () => ({ PrismaClient: class {} }));

/** A FETCH→IXSCAN winning plan (the healthy, index-served shape). */
const ixscanWinningPlan = {
  queryPlanner: {
    winningPlan: {
      stage: 'FETCH',
      inputStage: {
        stage: 'IXSCAN',
        indexName: 'createdAt_-1',
        keyPattern: { createdAt: -1 },
      },
    },
    rejectedPlans: [],
  },
};

/** A pure COLLSCAN winning plan with no index alternative considered. */
const collscanOnlyPlan = {
  queryPlanner: {
    winningPlan: { stage: 'COLLSCAN' },
    rejectedPlans: [],
  },
};

/** COLLSCAN wins (tiny collection) but an applicable IXSCAN sits in rejectedPlans. */
const collscanWinsIndexRejectedPlan = {
  queryPlanner: {
    winningPlan: { stage: 'COLLSCAN' },
    rejectedPlans: [
      {
        stage: 'FETCH',
        inputStage: { stage: 'IXSCAN', indexName: 'role_1', keyPattern: { role: 1 } },
      },
    ],
  },
};

/** A blocking in-memory SORT over a COLLSCAN (unindexed sort field). */
const blockingSortPlan = {
  queryPlanner: {
    winningPlan: {
      stage: 'SORT',
      inputStage: { stage: 'COLLSCAN' },
    },
    rejectedPlans: [],
  },
};

describe('collectStages', () => {
  it('flattens nested classic-engine stages', () => {
    const stages = collectStages(ixscanWinningPlan.queryPlanner.winningPlan);

    expect(stages.map((s) => s.stage)).toEqual(['FETCH', 'IXSCAN']);
  });

  it('captures the indexName and keyPattern of an IXSCAN node', () => {
    const stages = collectStages(ixscanWinningPlan.queryPlanner.winningPlan);
    const ixscan = stages.find((s) => s.stage === 'IXSCAN');

    expect(ixscan?.keyPattern).toEqual({ createdAt: -1 });
  });

  it('returns an empty array for a non-object node', () => {
    expect(collectStages(null)).toEqual([]);
  });

  it('descends into slot-based-execution queryPlan nesting', () => {
    const sbe = { queryPlan: { stage: 'FETCH', inputStage: { stage: 'IXSCAN' } } };

    expect(collectStages(sbe).map((s) => s.stage)).toEqual(['FETCH', 'IXSCAN']);
  });
});

describe('analyzePlan', () => {
  it('passes when the winning plan uses an acceptable leading-field index', () => {
    const verdict = analyzePlan(ixscanWinningPlan, ['createdAt']);

    expect(verdict.usesAcceptableIndex).toBe(true);
  });

  it('does not flag a healthy IXSCAN plan as a collection scan', () => {
    const verdict = analyzePlan(ixscanWinningPlan, ['createdAt']);

    expect(verdict.winningIsCollscan).toBe(false);
  });

  it('passes when an applicable index is only in rejectedPlans (tiny collection)', () => {
    const verdict = analyzePlan(collscanWinsIndexRejectedPlan, ['role']);

    expect(verdict.usesAcceptableIndex).toBe(true);
  });

  it('still reports the winning plan as a collection scan when the index lost on cost', () => {
    const verdict = analyzePlan(collscanWinsIndexRejectedPlan, ['role']);

    expect(verdict.winningIsCollscan).toBe(true);
  });

  it('fails when no index scan is considered at all', () => {
    const verdict = analyzePlan(collscanOnlyPlan, ['role']);

    expect(verdict.usesAcceptableIndex).toBe(false);
  });

  it('fails when the considered index has a different leading field', () => {
    const verdict = analyzePlan(ixscanWinningPlan, ['publishedOn']);

    expect(verdict.usesAcceptableIndex).toBe(false);
  });

  it('detects a blocking in-memory SORT stage', () => {
    const verdict = analyzePlan(blockingSortPlan, ['createdAt']);

    expect(verdict.winningHasBlockingSort).toBe(true);
  });

  it('deduplicates considered index names', () => {
    const duplicateIndexPlan = {
      queryPlanner: {
        winningPlan: { stage: 'IXSCAN', indexName: 'role_1', keyPattern: { role: 1 } },
        rejectedPlans: [{ stage: 'IXSCAN', indexName: 'role_1', keyPattern: { role: 1 } }],
      },
    };

    const verdict = analyzePlan(duplicateIndexPlan, ['role']);

    expect(verdict.consideredIndexes).toEqual(['role_1']);
  });
});

describe('analyzePlan consideredKeyPatterns', () => {
  it('collects the keyPattern of every considered IXSCAN', () => {
    const verdict = analyzePlan(collscanWinsIndexRejectedPlan, ['role']);

    expect(verdict.consideredKeyPatterns).toEqual([{ role: 1 }]);
  });

  it('is empty when only a collection scan is considered', () => {
    const verdict = analyzePlan(collscanOnlyPlan, ['role']);

    expect(verdict.consideredKeyPatterns).toEqual([]);
  });

  it('omits considered IXSCANs that carry no keyPattern', () => {
    const noKeyPatternPlan = {
      queryPlanner: {
        winningPlan: { stage: 'IXSCAN', indexName: 'role_1' },
        rejectedPlans: [],
      },
    };

    const verdict = analyzePlan(noKeyPatternPlan, ['role']);

    expect(verdict.consideredKeyPatterns).toEqual([]);
  });
});

describe('matchesKeyPrefix', () => {
  it('matches a keyPattern that begins with the required fields in order', () => {
    expect(matchesKeyPrefix([{ artistId: 1, sortOrder: 1 }], ['artistId', 'sortOrder'])).toBe(true);
  });

  it('matches a longer keyPattern by its leading prefix', () => {
    expect(
      matchesKeyPrefix([{ userId: 1, releaseId: 1, downloadedAt: 1 }], ['userId', 'releaseId'])
    ).toBe(true);
  });

  it('rejects when the field order differs', () => {
    expect(matchesKeyPrefix([{ sortOrder: 1, artistId: 1 }], ['artistId', 'sortOrder'])).toBe(
      false
    );
  });

  it('rejects when no considered index reaches the required depth', () => {
    expect(matchesKeyPrefix([{ artistId: 1 }], ['artistId', 'sortOrder'])).toBe(false);
  });
});

describe('classifyPlan', () => {
  const compoundPlan = {
    queryPlanner: {
      winningPlan: {
        stage: 'IXSCAN',
        indexName: 'artistId_sortOrder',
        keyPattern: { artistId: 1, sortOrder: 1 },
      },
      rejectedPlans: [],
    },
  };

  it('passes a leading-field target with no key-prefix requirement', () => {
    const result = classifyPlan({
      verdict: analyzePlan(ixscanWinningPlan, ['createdAt']),
      docCount: 5,
      indexNames: ['createdAt_-1'],
    });

    expect(result.status).toBe('PASS');
  });

  it('fails when a required compound prefix is absent from considered indexes', () => {
    const result = classifyPlan({
      verdict: analyzePlan(ixscanWinningPlan, ['createdAt']),
      docCount: 5,
      indexNames: ['createdAt_-1'],
      requiredKeyPrefix: ['createdAt', 'id'],
    });

    expect(result.failed).toBe(true);
  });

  it('passes when the required compound prefix is considered', () => {
    const result = classifyPlan({
      verdict: analyzePlan(compoundPlan, ['artistId']),
      docCount: 5,
      indexNames: ['artistId_sortOrder'],
      requiredKeyPrefix: ['artistId', 'sortOrder'],
    });

    expect(result.status).toBe('PASS');
  });

  it('skips an empty collection rather than failing', () => {
    const result = classifyPlan({
      verdict: analyzePlan(collscanOnlyPlan, ['role']),
      docCount: 0,
      indexNames: ['_id_'],
    });

    expect(result.status).toBe('SKIP');
  });

  it('fails when no acceptable index is considered and the collection has rows', () => {
    const result = classifyPlan({
      verdict: analyzePlan(collscanOnlyPlan, ['role']),
      docCount: 5,
      indexNames: ['_id_'],
    });

    expect(result.failed).toBe(true);
  });
});

describe('TARGETS', () => {
  it('declares acceptable leading fields for every target', () => {
    const allHaveLeadingFields = TARGETS.every((t) => t.acceptableLeadingFields.length > 0);

    expect(allHaveLeadingFields).toBe(true);
  });

  it('every requiredKeyPrefix starts with an acceptable leading field', () => {
    const consistent = TARGETS.every(
      (t) => !t.requiredKeyPrefix || t.acceptableLeadingFields.includes(t.requiredKeyPrefix[0])
    );

    expect(consistent).toBe(true);
  });
});

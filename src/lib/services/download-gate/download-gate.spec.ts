/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DownloadGate, type DownloadGateDeps, type GateFormatRecord } from './download-gate';
import { InProcessDownloadLock } from './lock';

import type { CommitArgs, CounterFacts, DownloadCounters, FailureArgs } from './counters';
import type { Deliverable, Outcome } from './types';

vi.mock('server-only', () => ({}));

const NOW = new Date('2026-10-01T12:00:00.000Z');
const RELEASE = '507f1f77bcf86cd799439011';
const user = { kind: 'user', userId: 'user-1' } as const;
const guest = { kind: 'guest', visitorId: 'visitor-1' } as const;
const audit = { ipAddress: '127.0.0.1', userAgent: 'spec' };

const record = (formatType: string, deletedAt: Date | null = null): GateFormatRecord =>
  ({ id: `fmt-${formatType}`, formatType, deletedAt, files: [] }) as unknown as GateFormatRecord;

/** In-memory counters: one free user, counters start at zero, commits are recorded. */
const fakeCounters = (initial: Partial<CounterFacts> = {}) => {
  let facts: CounterFacts = {
    entitled: false,
    lifetime: { distinctReleases: 0, includesThisRelease: false },
    freeThrottle: { count: 0, oldestInWindow: null },
    purchaseThrottle: null,
    ...initial,
  };
  const commits: CommitArgs[] = [];
  const failures: FailureArgs[] = [];
  const counters: DownloadCounters = {
    read: vi.fn(async () => facts),
    commit: vi.fn(async (args) => {
      commits.push(args);
      facts = {
        ...facts,
        freeThrottle: {
          count: facts.freeThrottle.count + 1,
          oldestInWindow: facts.freeThrottle.oldestInWindow ?? NOW,
        },
      };
    }),
    recordFailure: vi.fn(async (args) => {
      failures.push(args);
    }),
  };
  return { counters, commits, failures };
};

interface GateSetup {
  facts?: Partial<CounterFacts>;
  listed?: boolean;
  formats?: GateFormatRecord[];
}

const makeGate = ({
  facts = {},
  listed = true,
  formats = [record('MP3_320KBPS'), record('AAC'), record('FLAC')],
}: GateSetup = {}) => {
  const fake = fakeCounters(facts);
  const deps: DownloadGateDeps = {
    counters: fake.counters,
    lock: new InProcessDownloadLock(),
    releaseIsListed: vi.fn(async () => listed),
    formatsOf: vi.fn(async () => formats),
    now: () => NOW,
  };
  return { gate: new DownloadGate(deps), deps, ...fake };
};

const urlDeliverable: Deliverable = {
  kind: 'url',
  downloadUrl: 'https://cdn/bundle.zip',
  fileName: 'bundle.zip',
};

describe('DownloadGate.download', () => {
  it('grants, produces, commits, and releases the lock — in that order', async () => {
    const { gate, commits, deps } = makeGate();
    const order: string[] = [];
    vi.mocked(deps.counters.commit).mockImplementation(async (args) => {
      order.push('commit');
      commits.push(args);
    });

    const outcome = await gate.download(
      { subject: user, releaseId: RELEASE, formats: ['MP3_320KBPS', 'AAC'] },
      async (grant, records) => {
        order.push(`produce:${grant.mode}:${records.map((r) => r.formatType).join('+')}`);
        return urlDeliverable;
      },
      audit
    );

    expect(outcome).toEqual({
      ok: true,
      grant: expect.objectContaining({ mode: 'free' }),
      deliverable: urlDeliverable,
    });
    expect(order).toEqual(['produce:free:MP3_320KBPS+AAC', 'commit']);
    expect(deps.lock.acquire('user:user-1')).toBe(true);
  });

  it('returns NOT_FOUND without touching counters when the release is not listed', async () => {
    const { gate, deps } = makeGate({ listed: false });
    const produce = vi.fn();

    const outcome = await gate.download(
      { subject: user, releaseId: RELEASE, formats: ['AAC'] },
      produce,
      audit
    );

    expect(outcome).toEqual({ ok: false, denial: null, reason: 'NOT_FOUND' });
    expect(produce).not.toHaveBeenCalled();
    expect(deps.counters.read).not.toHaveBeenCalled();
  });

  it('returns the denial, records the failure with the mode, and charges nothing', async () => {
    const { gate, commits, failures } = makeGate({
      facts: { freeThrottle: { count: 3, oldestInWindow: NOW } },
    });
    const produce = vi.fn();

    const outcome = await gate.download(
      { subject: user, releaseId: RELEASE, formats: ['AAC'] },
      produce,
      audit
    );

    expect(outcome).toMatchObject({ ok: false, denial: { reason: 'THROTTLED' } });
    expect(produce).not.toHaveBeenCalled();
    expect(commits).toEqual([]);
    expect(failures.map(({ errorCode, mode }) => `${errorCode}:${mode}`)).toEqual([
      'THROTTLED:free',
    ]);
  });

  it('a producer failure charges nothing, records STREAM_FAILED, releases the lock, and rethrows', async () => {
    const { gate, commits, failures, deps } = makeGate();

    await expect(
      gate.download(
        { subject: user, releaseId: RELEASE, formats: ['AAC'] },
        async () => {
          throw new Error('s3 down');
        },
        audit
      )
    ).rejects.toThrow('s3 down');

    expect(commits).toEqual([]);
    expect(failures.map(({ errorCode }) => errorCode)).toEqual(['STREAM_FAILED']);
    expect(deps.lock.acquire('user:user-1')).toBe(true);
  });

  it('hands the producer the repository records for exactly the granted formats, in request order', async () => {
    const { gate } = makeGate();
    const seen: string[] = [];

    await gate.download(
      { subject: user, releaseId: RELEASE, formats: ['AAC', 'MP3_320KBPS', 'WAV'] },
      async (_grant, records) => {
        seen.push(...records.map(({ formatType }) => formatType));
        return urlDeliverable;
      },
      audit
    );

    expect(seen).toEqual(['AAC', 'MP3_320KBPS']);
  });

  it('exposes withdrawn formats to the decision as withdrawn', async () => {
    const { gate } = makeGate({ formats: [record('AAC', NOW)] });

    const outcome = await gate.download(
      { subject: user, releaseId: RELEASE, formats: ['AAC'] },
      vi.fn(),
      audit
    );

    expect(outcome).toMatchObject({ ok: false, denial: { reason: 'DELETED', formats: ['AAC'] } });
  });

  it('keys the lock on the subject: a guest and a user never block each other', async () => {
    const { gate, deps } = makeGate();
    expect(deps.lock.acquire('guest:visitor-1')).toBe(true);

    const outcome = await gate.download(
      { subject: user, releaseId: RELEASE, formats: ['AAC'] },
      async () => urlDeliverable,
      audit
    );

    expect(outcome.ok).toBe(true);
  });

  describe('concurrency', () => {
    it('two overlapping downloads by one subject: the second is LOCK_HELD and only one charge is made', async () => {
      const { gate, commits } = makeGate();
      let releaseFirst: (deliverable: Deliverable) => void = () => {};
      const held = new Promise<Deliverable>((resolve) => {
        releaseFirst = resolve;
      });

      const first = gate.download(
        { subject: user, releaseId: RELEASE, formats: ['AAC'] },
        () => held,
        audit
      );
      const second = await gate.download(
        { subject: user, releaseId: RELEASE, formats: ['AAC'] },
        async () => urlDeliverable,
        audit
      );
      releaseFirst(urlDeliverable);
      const firstOutcome = await first;

      expect(second).toEqual({ ok: false, denial: null, reason: 'LOCK_HELD' });
      expect(firstOutcome.ok).toBe(true);
      expect(commits).toHaveLength(1);
    });

    it('sequential downloads see the previous charge: the fourth is THROTTLED', async () => {
      const { gate } = makeGate();
      const request = { subject: guest, releaseId: RELEASE, formats: ['AAC' as const] };

      const outcomes: Outcome[] = [];
      for (let i = 0; i < 4; i += 1) {
        outcomes.push(await gate.download(request, async () => urlDeliverable, audit));
      }

      const label = (o: (typeof outcomes)[number]): string =>
        o.ok ? 'ok' : o.denial === null ? o.reason : o.denial.reason;
      expect(outcomes.map(label)).toEqual(['ok', 'ok', 'ok', 'THROTTLED']);
    });
  });
});

describe('DownloadGate.check', () => {
  it('decides without locking or charging', async () => {
    const { gate, commits, failures, deps } = makeGate();

    const decision = await gate.check({ subject: user, releaseId: RELEASE, formats: ['AAC'] });

    expect(decision).toMatchObject({ kind: 'grant', mode: 'free' });
    expect(commits).toEqual([]);
    expect(failures).toEqual([]);
    expect(deps.lock.acquire('user:user-1')).toBe(true);
  });

  it('reports a missing release as not-found', async () => {
    const { gate } = makeGate({ listed: false });

    expect(await gate.check({ subject: user, releaseId: RELEASE, formats: ['AAC'] })).toEqual({
      kind: 'not-found',
    });
  });
});

describe('DownloadGate.status', () => {
  it('describes the free tier for a user: free formats, throttle, lifetime', async () => {
    const { gate } = makeGate({
      facts: {
        lifetime: { distinctReleases: 2, includesThisRelease: false },
        freeThrottle: { count: 1, oldestInWindow: new Date(NOW.getTime() - 3600_000) },
      },
    });

    const status = await gate.status(user, RELEASE);

    expect(status).toEqual({
      entitled: false,
      mode: 'free',
      availableFreeFormats: ['MP3_320KBPS', 'AAC'],
      freeThrottle: {
        allowed: true,
        remaining: 2,
        resetsAt: new Date(NOW.getTime() + 23 * 3600_000),
      },
      lifetime: { remaining: 3, includesThisRelease: false },
      purchaseThrottle: null,
    });
  });

  it('describes an entitled user: purchased mode and the purchase throttle', async () => {
    const { gate } = makeGate({
      facts: {
        entitled: true,
        purchaseThrottle: { count: 5, lastDownloadedAt: new Date(NOW.getTime() - 3600_000) },
      },
    });

    const status = await gate.status(user, RELEASE);

    expect(status).toMatchObject({
      entitled: true,
      mode: 'purchased',
      purchaseThrottle: { count: 5, resetInHours: 5 },
    });
  });

  it('omits withdrawn formats from the free tier and returns null for a missing release', async () => {
    const withdrawn = makeGate({ formats: [record('MP3_320KBPS'), record('AAC', NOW)] });
    const missing = makeGate({ listed: false });

    expect((await withdrawn.gate.status(guest, RELEASE))?.availableFreeFormats).toEqual([
      'MP3_320KBPS',
    ]);
    expect(await missing.gate.status(guest, RELEASE)).toBeNull();
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { deriveJobSigningKey, signJobBody } from '@fakefour/job-contract/signing';
import { z } from 'zod';

import type { Json } from '@/lib/types/domain/shared';
import { STALE_JOB_MS, STALE_JOB_TIMEOUT_MESSAGE } from '@/utils/async-job-lifecycle';

import { JobRunner } from './job-runner';

import type {
  InvokeAck,
  JobAdapter,
  JobCopy,
  JobDispatch,
  JobInvoker,
  JobProgressChannel,
  JobTypes,
} from './types';

vi.mock('server-only', () => ({}));

const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { warn: mockLoggerWarn, error: mockLoggerError, info: vi.fn() } },
}));

const ID = 'e'.repeat(24);
const BASE_URL = 'https://fakefourrecords.com';
const APP_SECRET = 'app-callback-secret-'.padEnd(40, 'x');
const STORED_TOKEN = 'stored-token';
const CALLBACK_BODY = '{"jobToken":"stored-token","result":{"ok":true,"data":{"value":"x"}}}';

/** An in-memory entity row carrying the lifecycle columns, like an Artist or a Video. */
interface TestRecord {
  status: string | null;
  startedAt: Date | null;
  error: string | null;
  jobToken: string | null;
  progress: Json | null;
  label: string;
  eligible: boolean;
  added: number | null;
}

interface TestJobTypes extends JobTypes {
  record: TestRecord;
  input: { note?: string };
  request: { entityId: string; note?: string };
  data: { value: string };
  claim: { label: string };
  persisted: number;
  checkpoint: { stage: string; at?: string };
  progress: { stage: string; at: string };
}

const COPY: JobCopy = {
  notFound: 'Thing not found.',
  noCallbackUrl: 'Thing callback URL is not configured',
  notConfigured: 'Thing is not configured',
  unreachable: 'Failed to reach the thing',
  runFailed: 'Thing failed unexpectedly.',
  persistFailed: 'Thing persistence failed.',
};

const row = (overrides: Partial<TestRecord> = {}): TestRecord => ({
  status: null,
  startedAt: null,
  error: null,
  jobToken: null,
  progress: null,
  label: 'the-label',
  eligible: true,
  added: null,
  ...overrides,
});

/** A fresh in-flight start: well inside the stale window. */
const fresh = (): Date => new Date(Date.now() - 60_000);

/** A start older than the stale window. */
const stale = (): Date => new Date(Date.now() - STALE_JOB_MS - 60_000);

/** The job kind's in-memory store plus an adapter over it, with every write spied. */
const createJob = (initial: TestRecord | null = row()) => {
  const rows = new Map<string, TestRecord>();
  if (initial) rows.set(ID, initial);
  const patch = (id: string, fields: Partial<TestRecord>): void => {
    const current = rows.get(id);
    if (!current) throw new Error(`no row ${id}`);
    rows.set(id, { ...current, ...fields });
  };

  const channel: JobProgressChannel<TestJobTypes> = {
    path: (id) => `/api/things/${id}/progress`,
    schema: z.object({ stage: z.string(), at: z.string() }),
    write: vi.fn(async (id, progress) => patch(id, { progress })),
  };

  const job: JobAdapter<TestJobTypes> = {
    kind: 'image-links',
    copy: COPY,
    callbackPath: (id) => `/api/things/${id}/callback`,
    progress: channel,
    fake: { delayMs: 0, result: () => ({ ok: true, data: { value: 'x' } }) },
    read: vi.fn(async (id) => {
      const found = rows.get(id);
      return found ? { ...found } : null;
    }),
    state: ({ status, startedAt, error, jobToken, progress }) => ({
      status,
      startedAt,
      error,
      jobToken,
      progress,
    }),
    claimContext: ({ label }) => ({ label }),
    markPending: vi.fn(async (id, startedAt) => patch(id, { status: 'pending', startedAt })),
    begin: vi.fn(async (id, now) => {
      const current = rows.get(id);
      const blocked =
        current?.status === 'processing' &&
        current.startedAt !== null &&
        now.getTime() - current.startedAt.getTime() <= STALE_JOB_MS;
      if (!current || blocked) return false;
      patch(id, { status: 'processing', startedAt: now, error: null });
      return true;
    }),
    setToken: vi.fn(async (id, jobToken) => patch(id, { jobToken })),
    claimToken: vi.fn(async (id, token) => {
      const current = rows.get(id);
      if (current?.jobToken !== token || current?.status !== 'processing') return false;
      patch(id, { jobToken: null });
      return true;
    }),
    recordFailed: vi.fn(async (id, error) => patch(id, { status: 'failed', error })),
    recordSucceeded: vi.fn(async (id, added) =>
      patch(id, { status: 'succeeded', error: null, added })
    ),
    prepare: vi.fn(async (id, { note }) => ({
      ok: true as const,
      request: { entityId: id, note },
    })),
    persist: vi.fn(async (_id, { value }) => value.length),
  };
  return { job, channel, current: (): TestRecord | undefined => rows.get(ID) };
};

/** A fake invoke port recording every payload it is handed. */
const fakeInvoker = (ack: InvokeAck = { ok: true }) => {
  const payloads: JobDispatch[] = [];
  const invoker: JobInvoker = {
    invoke: async (_job, payload) => {
      payloads.push(payload);
      return ack;
    },
  };
  return { invoker, payloads };
};

const signingKeyFor = (jobToken: string): string =>
  deriveJobSigningKey(APP_SECRET, { kind: 'image-links', entityId: ID, jobToken });

/** A proof signed the way the Lambda signs it, under the key for `keyToken`. */
const proofFor = (keyToken: string, rawBody = CALLBACK_BODY) => ({
  signature: signJobBody(signingKeyFor(keyToken), rawBody, Date.now() / 1000),
  rawBody,
});

const inFlight = (overrides: Partial<TestRecord> = {}): TestRecord =>
  row({ status: 'processing', startedAt: fresh(), jobToken: STORED_TOKEN, ...overrides });

beforeEach(() => {
  vi.stubEnv('JOB_CALLBACK_SECRET', APP_SECRET);
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', BASE_URL);
});

describe('JobRunner.trigger', () => {
  it('fails NOT_FOUND with the kind copy when the entity is missing', async () => {
    const { job } = createJob(null);

    const result = await new JobRunner(fakeInvoker()).trigger(job, ID);

    expect(result).toEqual({ success: false, error: COPY.notFound, code: 'NOT_FOUND' });
  });

  it('fails VALIDATION with the adapter refusal before any write', async () => {
    const before = row({ eligible: false });
    const { job, current } = createJob(before);
    job.refusal = ({ eligible }) => (eligible ? null : 'Name someone first.');

    const result = await new JobRunner(fakeInvoker()).trigger(job, ID);

    expect(result).toEqual({ success: false, error: 'Name someone first.', code: 'VALIDATION' });
    expect(current()).toEqual(before);
  });

  it('echoes a fresh pending job without starting a run', async () => {
    const before = row({ status: 'pending', startedAt: fresh() });
    const { job, current } = createJob(before);

    const result = await new JobRunner(fakeInvoker()).trigger(job, ID);

    expect(result).toEqual({ success: true, data: { status: 'pending', started: false } });
    expect(current()).toEqual(before);
  });

  it('echoes a fresh processing job without starting a run', async () => {
    const { job } = createJob(row({ status: 'processing', startedAt: fresh() }));

    const result = await new JobRunner(fakeInvoker()).trigger(job, ID);

    expect(result).toEqual({ success: true, data: { status: 'processing', started: false } });
  });

  it('writes pending with its start time when nothing is in flight', async () => {
    const { job, current } = createJob(row({ status: 'succeeded', startedAt: fresh() }));
    const before = Date.now();

    const result = await new JobRunner(fakeInvoker()).trigger(job, ID);

    expect(result).toEqual({ success: true, data: { status: 'pending', started: true } });
    expect(current()?.status).toBe('pending');
    expect(current()?.startedAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('supersedes a stale in-flight job', async () => {
    const { job, current } = createJob(row({ status: 'processing', startedAt: stale() }));

    const result = await new JobRunner(fakeInvoker()).trigger(job, ID);

    expect(result).toEqual({ success: true, data: { status: 'pending', started: true } });
    expect(current()?.status).toBe('pending');
  });

  it('lets an unexpected error propagate to the caller', async () => {
    const { job } = createJob();
    job.read = vi.fn(async () => {
      throw new Error('db down');
    });

    await expect(new JobRunner(fakeInvoker()).trigger(job, ID)).rejects.toThrow('db down');
  });
});

describe('JobRunner.run', () => {
  it('skips without writing when the adapter refuses before begin', async () => {
    const before = row({ status: 'pending', startedAt: fresh(), eligible: false });
    const { job, current } = createJob(before);
    job.refusal = ({ eligible }) => (eligible ? null : 'Name someone first.');
    const { invoker, payloads } = fakeInvoker();

    const result = await new JobRunner({ invoker }).run(job, ID, {});

    expect(result).toEqual({ status: 'skipped' });
    expect(current()).toEqual(before);
    expect(payloads).toEqual([]);
  });

  it('skips a refusing kind whose entity is gone', async () => {
    const { job } = createJob(null);
    job.refusal = () => null;

    const result = await new JobRunner(fakeInvoker()).run(job, ID, {});

    expect(result).toEqual({ status: 'skipped' });
  });

  it('skips when another runner already began the job', async () => {
    const before = row({ status: 'processing', startedAt: fresh() });
    const { job, current } = createJob(before);
    const { invoker, payloads } = fakeInvoker();

    const result = await new JobRunner({ invoker }).run(job, ID, {});

    expect(result).toEqual({ status: 'skipped' });
    expect(current()).toEqual(before);
    expect(payloads).toEqual([]);
  });

  it('records the adapter copy when preparation fails, without a token or an invoke', async () => {
    const { job, current } = createJob();
    job.prepare = async () => ({ ok: false, error: 'Add at least one link first.' });
    const { invoker, payloads } = fakeInvoker();

    const result = await new JobRunner({ invoker }).run(job, ID, {});

    expect(result).toEqual({ status: 'failed', error: 'Add at least one link first.' });
    expect(current()).toMatchObject({
      status: 'failed',
      error: 'Add at least one link first.',
      jobToken: null,
    });
    expect(payloads).toEqual([]);
  });

  it('records the kind copy when the base URL is unset, without a token or an invoke', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    const { job, current } = createJob();
    const { invoker, payloads } = fakeInvoker();

    const result = await new JobRunner({ invoker }).run(job, ID, {});

    expect(result).toEqual({ status: 'failed', error: COPY.noCallbackUrl });
    expect(current()).toMatchObject({ status: 'failed', jobToken: null });
    expect(payloads).toEqual([]);
  });

  it('derives the key before storing the token: an unset secret fails and stores no token', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', '');
    const { job, current } = createJob();
    const { invoker, payloads } = fakeInvoker();

    const result = await new JobRunner({ invoker }).run(job, ID, {});

    expect(result).toEqual({
      status: 'failed',
      error: expect.stringContaining('JOB_CALLBACK_SECRET'),
    });
    expect(current()).toMatchObject({ status: 'failed', jobToken: null });
    expect(job.setToken).not.toHaveBeenCalled();
    expect(payloads).toEqual([]);
  });

  it('stores a token and invokes with the request, the URLs, the token and its key', async () => {
    const { job, current } = createJob();
    const { invoker, payloads } = fakeInvoker();

    const result = await new JobRunner({ invoker }).run(job, ID, { note: 'hi' });

    const jobToken = current()?.jobToken ?? '';
    expect(result).toEqual({ status: 'dispatched' });
    expect(payloads).toEqual([
      {
        entityId: ID,
        note: 'hi',
        callbackUrl: `${BASE_URL}/api/things/${ID}/callback`,
        progressUrl: `${BASE_URL}/api/things/${ID}/progress`,
        jobToken,
        signingKey: signingKeyFor(jobToken),
      },
    ]);
  });

  it('leaves the job processing for the callback to finish', async () => {
    const { job, current } = createJob();

    await new JobRunner(fakeInvoker()).run(job, ID, {});

    expect(current()?.status).toBe('processing');
  });

  it('sends no progress URL for a kind without a progress channel', async () => {
    const { job } = createJob();
    delete job.progress;
    const { invoker, payloads } = fakeInvoker();

    await new JobRunner({ invoker }).run(job, ID, {});

    expect(payloads[0]).not.toHaveProperty('progressUrl');
  });

  it('clears the token and records the ack copy when the invoke fails', async () => {
    const { job, current } = createJob();

    const result = await new JobRunner(fakeInvoker({ ok: false, error: 'Nope.' })).run(job, ID, {});

    expect(result).toEqual({ status: 'failed', error: 'Nope.' });
    expect(current()).toMatchObject({ status: 'failed', error: 'Nope.', jobToken: null });
  });

  it('records a thrown error message and never throws', async () => {
    const { job, current } = createJob();
    job.setToken = async () => {
      throw new Error('DB down');
    };

    const result = await new JobRunner(fakeInvoker()).run(job, ID, {});

    expect(result).toEqual({ status: 'failed', error: 'DB down' });
    expect(current()).toMatchObject({ status: 'failed', error: 'DB down' });
  });

  it('records the kind fallback copy when the thrown value is not an Error', async () => {
    const { job } = createJob();
    job.begin = async () => {
      throw 'boom';
    };

    const result = await new JobRunner(fakeInvoker()).run(job, ID, {});

    expect(result).toEqual({ status: 'failed', error: COPY.runFailed });
  });

  it('logs a failed terminal write instead of throwing', async () => {
    const { job } = createJob();
    job.prepare = async () => ({ ok: false, error: 'Nope.' });
    job.recordFailed = async () => {
      throw new Error('write lost');
    };

    const result = await new JobRunner(fakeInvoker()).run(job, ID, {});

    expect(result).toEqual({ status: 'failed', error: 'Nope.' });
    expect(mockLoggerError).toHaveBeenCalledWith('job_status_write_failed', expect.any(Error), {
      kind: 'image-links',
      entityId: ID,
      status: 'failed',
    });
  });
});

describe('JobRunner.view', () => {
  const runner = new JobRunner(fakeInvoker());

  it('surfaces the parsed checkpoint while the job is in flight', () => {
    const { job } = createJob();
    const progress = { stage: 'reading', at: '2026-10-18T12:00:00.000Z' };

    const view = runner.view(job, inFlight({ progress }));

    expect(view).toEqual({ status: 'processing', error: null, progress });
  });

  it('coerces a stale in-flight job to failed with the timeout copy and no progress', () => {
    const { job } = createJob();

    const view = runner.view(
      job,
      inFlight({ startedAt: stale(), progress: { stage: 'reading', at: 'x' } })
    );

    expect(view).toEqual({ status: 'failed', error: STALE_JOB_TIMEOUT_MESSAGE, progress: null });
  });

  it('withholds progress once the job is terminal', () => {
    const { job } = createJob();

    const view = runner.view(
      job,
      row({ status: 'succeeded', progress: { stage: 'reading', at: 'x' } })
    );

    expect(view).toEqual({ status: 'succeeded', error: null, progress: null });
  });

  it('reads a malformed checkpoint as null', () => {
    const { job } = createJob();

    const view = runner.view(job, inFlight({ progress: { stage: 42 } }));

    expect(view.progress).toBeNull();
  });

  it('reads no progress for a kind without a progress channel', () => {
    const { job } = createJob();
    delete job.progress;

    const view = runner.view(job, inFlight({ progress: { stage: 'reading', at: 'x' } }));

    expect(view.progress).toBeNull();
  });

  it('reads a status outside the lifecycle as never run', () => {
    const { job } = createJob();

    const view = runner.view(job, row({ status: 'exploded' }));

    expect(view.status).toBeNull();
  });
});

describe('JobRunner.claim', () => {
  const runner = new JobRunner(fakeInvoker());

  it('returns the claim context and consumes the token on a win', async () => {
    const { job, current } = createJob(inFlight());

    const claim = await runner.claim(job, ID, STORED_TOKEN, proofFor(STORED_TOKEN));

    expect(claim).toEqual({ label: 'the-label' });
    expect(current()?.jobToken).toBeNull();
  });

  it('returns null when the entity is missing', async () => {
    const { job } = createJob(null);

    expect(await runner.claim(job, ID, STORED_TOKEN, proofFor(STORED_TOKEN))).toBeNull();
  });

  it('returns null without claiming when the job is not processing', async () => {
    const { job } = createJob(inFlight({ status: 'failed' }));

    const claim = await runner.claim(job, ID, STORED_TOKEN, proofFor(STORED_TOKEN));

    expect(claim).toBeNull();
    expect(job.claimToken).not.toHaveBeenCalled();
  });

  it('returns null without claiming when no token is stored', async () => {
    const { job } = createJob(inFlight({ jobToken: null }));

    const claim = await runner.claim(job, ID, STORED_TOKEN, proofFor(STORED_TOKEN));

    expect(claim).toBeNull();
    expect(job.claimToken).not.toHaveBeenCalled();
  });

  it('refuses a callback signed under another token’s key, even with the right token', async () => {
    const { job, current } = createJob(inFlight());

    const claim = await runner.claim(job, ID, STORED_TOKEN, proofFor('another-token'));

    expect(claim).toBeNull();
    expect(job.claimToken).not.toHaveBeenCalled();
    expect(current()?.jobToken).toBe(STORED_TOKEN);
  });

  it('checks the signature before the token compare', async () => {
    const { job } = createJob(inFlight());

    await runner.claim(job, ID, 'wrong-token', { signature: null, rawBody: CALLBACK_BODY });

    expect(mockLoggerWarn).toHaveBeenCalledWith('job_callback_signature_rejected', {
      kind: 'image-links',
      entityId: ID,
      reason: 'missing',
    });
  });

  it('never attempts the claim when a validly signed callback carries the wrong token', async () => {
    const { job } = createJob(inFlight());

    const claim = await runner.claim(job, ID, 'wrong-token', proofFor(STORED_TOKEN));

    expect(claim).toBeNull();
    expect(job.claimToken).not.toHaveBeenCalled();
  });

  it('lets exactly one of two concurrent claims win', async () => {
    const { job } = createJob(inFlight());

    const claims = await Promise.all([
      runner.claim(job, ID, STORED_TOKEN, proofFor(STORED_TOKEN)),
      runner.claim(job, ID, STORED_TOKEN, proofFor(STORED_TOKEN)),
    ]);

    expect(claims.filter((claim) => claim !== null)).toEqual([{ label: 'the-label' }]);
  });
});

describe('JobRunner.recordProgress', () => {
  const runner = new JobRunner(fakeInvoker());
  const PROGRESS_BODY = '{"jobToken":"stored-token","stage":"reading"}';
  const signedProgress = () => proofFor(STORED_TOKEN, PROGRESS_BODY);

  it('writes the checkpoint and never claims the token', async () => {
    const { job, current } = createJob(inFlight());

    const wrote = await runner.recordProgress(job, ID, {
      jobToken: STORED_TOKEN,
      checkpoint: { stage: 'reading' },
      proof: signedProgress(),
    });

    expect(wrote).toBe(true);
    expect(current()?.progress).toEqual({ stage: 'reading', at: expect.any(String) });
    expect(current()?.jobToken).toBe(STORED_TOKEN);
    expect(job.claimToken).not.toHaveBeenCalled();
  });

  describe('with a frozen clock', () => {
    const NOW = new Date('2026-10-18T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('overwrites a client-sent at with the server stamp', async () => {
      const { job, current } = createJob(inFlight());

      await runner.recordProgress(job, ID, {
        jobToken: STORED_TOKEN,
        checkpoint: { stage: 'reading', at: '1999-01-01T00:00:00.000Z' },
        proof: signedProgress(),
      });

      expect(current()?.progress).toEqual({ stage: 'reading', at: NOW.toISOString() });
    });
  });

  it('writes nothing unless the job is processing', async () => {
    const { job, channel } = createJob(inFlight({ status: 'pending' }));

    const wrote = await runner.recordProgress(job, ID, {
      jobToken: STORED_TOKEN,
      checkpoint: { stage: 'reading' },
      proof: signedProgress(),
    });

    expect(wrote).toBe(false);
    expect(channel.write).not.toHaveBeenCalled();
  });

  it('writes nothing when the token does not match', async () => {
    const { job, channel } = createJob(inFlight());

    const wrote = await runner.recordProgress(job, ID, {
      jobToken: 'wrong-token',
      checkpoint: { stage: 'reading' },
      proof: signedProgress(),
    });

    expect(wrote).toBe(false);
    expect(channel.write).not.toHaveBeenCalled();
  });

  it('writes nothing on an unsigned checkpoint', async () => {
    const { job, channel } = createJob(inFlight());

    const wrote = await runner.recordProgress(job, ID, {
      jobToken: STORED_TOKEN,
      checkpoint: { stage: 'reading' },
      proof: { signature: null, rawBody: PROGRESS_BODY },
    });

    expect(wrote).toBe(false);
    expect(channel.write).not.toHaveBeenCalled();
  });

  it('writes nothing when no token is stored', async () => {
    const { job } = createJob(inFlight({ jobToken: null }));

    const wrote = await runner.recordProgress(job, ID, {
      jobToken: STORED_TOKEN,
      checkpoint: { stage: 'reading' },
      proof: signedProgress(),
    });

    expect(wrote).toBe(false);
  });

  it('writes nothing when the entity is missing', async () => {
    const { job } = createJob(null);

    const wrote = await runner.recordProgress(job, ID, {
      jobToken: STORED_TOKEN,
      checkpoint: { stage: 'reading' },
      proof: signedProgress(),
    });

    expect(wrote).toBe(false);
  });

  it('writes nothing for a kind without a progress channel', async () => {
    const { job } = createJob(inFlight());
    delete job.progress;

    const wrote = await runner.recordProgress(job, ID, {
      jobToken: STORED_TOKEN,
      checkpoint: { stage: 'reading' },
      proof: signedProgress(),
    });

    expect(wrote).toBe(false);
  });

  it('logs a failed write and never throws', async () => {
    const { job, channel } = createJob(inFlight());
    const error = new Error('write lost');
    channel.write = async () => {
      throw error;
    };

    const wrote = await runner.recordProgress(job, ID, {
      jobToken: STORED_TOKEN,
      checkpoint: { stage: 'reading' },
      proof: signedProgress(),
    });

    expect(wrote).toBe(false);
    expect(mockLoggerError).toHaveBeenCalledWith('job_progress_record_failed', error, {
      kind: 'image-links',
      entityId: ID,
    });
  });
});

describe('JobRunner.complete', () => {
  const runner = new JobRunner(fakeInvoker());
  const claim = { label: 'the-label' };

  it('records failed with the result error on a non-ok result', async () => {
    const { job, current } = createJob(inFlight({ jobToken: null }));

    await runner.complete(job, ID, { ok: false, error: 'Lambda gave up.' }, claim);

    expect(current()).toMatchObject({ status: 'failed', error: 'Lambda gave up.' });
    expect(job.persist).not.toHaveBeenCalled();
  });

  it('persists an ok result, then records succeeded with what persistence returned', async () => {
    const { job, current } = createJob(inFlight({ jobToken: null }));

    await runner.complete(job, ID, { ok: true, data: { value: 'abcd' } }, claim);

    expect(job.persist).toHaveBeenCalledWith(ID, { value: 'abcd' }, claim);
    expect(current()).toMatchObject({ status: 'succeeded', error: null, added: 4 });
  });

  it('records failed with the persist error message', async () => {
    const { job, current } = createJob(inFlight({ jobToken: null }));
    job.persist = async () => {
      throw new Error('rehost exploded');
    };

    await runner.complete(job, ID, { ok: true, data: { value: 'x' } }, claim);

    expect(current()).toMatchObject({ status: 'failed', error: 'rehost exploded' });
  });

  it('records the kind fallback copy when persistence throws a non-Error', async () => {
    const { job, current } = createJob(inFlight({ jobToken: null }));
    job.persist = async () => {
      throw 'boom';
    };

    await runner.complete(job, ID, { ok: true, data: { value: 'x' } }, claim);

    expect(current()).toMatchObject({ status: 'failed', error: COPY.persistFailed });
  });

  it('logs a failed succeeded write instead of throwing', async () => {
    const { job } = createJob(inFlight({ jobToken: null }));
    job.recordSucceeded = async () => {
      throw new Error('write lost');
    };

    await expect(
      runner.complete(job, ID, { ok: true, data: { value: 'x' } }, claim)
    ).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledWith('job_status_write_failed', expect.any(Error), {
      kind: 'image-links',
      entityId: ID,
      status: 'succeeded',
    });
  });
});

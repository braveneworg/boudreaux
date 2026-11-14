/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createHmac } from 'node:crypto';

import { submissionReencodeProgressPostSchema } from '@fakefour/job-contract';

import { createProgressReporter, postProgress } from './progress.js';

const logEventMock = vi.hoisted(() => vi.fn());

vi.mock('./lib/log.js', () => ({
  logEvent: logEventMock,
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const okResponse = (): Response => new Response('ok', { status: 200 });

const SIGNING_KEY = 'cd'.repeat(32);
const PROGRESS_URL = 'https://app.example/api/community/attachments/a/reencode/progress?x=secret';
const START_MS = Date.parse('2026-11-11T12:00:00.000Z');

const target = { progressUrl: PROGRESS_URL, jobToken: 'tok-1' };

/** A fetch seam and a clock the test moves by hand. */
const harness = (fetchFn: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(okResponse())) => {
  const clock = { nowMs: START_MS };
  return {
    fetchFn,
    clock,
    deps: { fetchFn: fetchFn as unknown as typeof fetch, now: () => clock.nowMs },
  };
};

const sentInit = (fetchFn: ReturnType<typeof vi.fn>, call = 0): RequestInit =>
  (fetchFn.mock.calls.at(call) as [string, RequestInit])[1];

const sentBodies = (fetchFn: ReturnType<typeof vi.fn>): unknown[] =>
  fetchFn.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as unknown);

describe('postProgress', () => {
  it('POSTs the token and the stage to the progress url', async () => {
    const { fetchFn, deps } = harness();

    await postProgress({ ...target, stage: 'downloading' }, deps);

    expect(fetchFn).toHaveBeenCalledWith(PROGRESS_URL, expect.objectContaining({ method: 'POST' }));
    expect(sentBodies(fetchFn)).toEqual([{ jobToken: 'tok-1', stage: 'downloading' }]);
  });

  it('sends a body the wire contract accepts, with the percent when there is one', async () => {
    const { fetchFn, deps } = harness();

    await postProgress({ ...target, stage: 'encoding', percent: 42 }, deps);

    const body = sentBodies(fetchFn).at(0);
    expect(body).toEqual({ jobToken: 'tok-1', stage: 'encoding', percent: 42 });
    expect(submissionReencodeProgressPostSchema.safeParse(body).success).toBe(true);
  });

  it('signs the exact body it sends with the per-job key', async () => {
    const { fetchFn, deps } = harness();

    await postProgress({ ...target, stage: 'probing', signingKey: SIGNING_KEY }, deps);

    const init = sentInit(fetchFn);
    const t = START_MS / 1000;
    const digest = createHmac('sha256', SIGNING_KEY).update(`${t}.${init.body}`).digest('hex');
    expect((init.headers as Record<string, string>)['x-job-signature']).toBe(`t=${t},v1=${digest}`);
  });

  it('sends no signature header when the event carried no signing key', async () => {
    const { fetchFn, deps } = harness();

    await postProgress({ ...target, stage: 'probing' }, deps);

    expect(sentInit(fetchFn).headers).not.toHaveProperty('x-job-signature');
  });

  it('caps the request with an abort timeout signal', async () => {
    const { fetchFn, deps } = harness();

    await postProgress({ ...target, stage: 'probing' }, deps);

    expect(sentInit(fetchFn).signal).toBeInstanceOf(AbortSignal);
  });

  it('never retries, even on a status the callback would retry', async () => {
    const { fetchFn, deps } = harness(
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    );

    await postProgress({ ...target, stage: 'storing' }, deps);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('logs the stage and status when the endpoint responds non-ok', async () => {
    const { deps } = harness(vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await postProgress({ ...target, stage: 'storing' }, deps);

    expect(logEventMock).toHaveBeenCalledWith('warn', 'reencode_progress_non_ok', {
      stage: 'storing',
      status: 503,
    });
  });

  it('resolves without throwing when the fetch rejects', async () => {
    const { deps } = harness(vi.fn().mockRejectedValue(new Error('network down')));

    await expect(postProgress({ ...target, stage: 'probing' }, deps)).resolves.toBeUndefined();
  });

  it('resolves without throwing when the request is aborted by the timeout', async () => {
    const { deps } = harness(
      vi.fn().mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))
    );

    await expect(postProgress({ ...target, stage: 'probing' }, deps)).resolves.toBeUndefined();
  });

  it('never logs the progress url, the token or the key', async () => {
    const { deps } = harness(vi.fn().mockRejectedValue(new Error(`no route to ${PROGRESS_URL}`)));

    await postProgress({ ...target, stage: 'probing', signingKey: SIGNING_KEY }, deps);

    const logged = JSON.stringify(logEventMock.mock.calls);
    expect(logged).not.toContain('x=secret');
    expect(logged).not.toContain('tok-1');
    expect(logged).not.toContain(SIGNING_KEY);
  });
});

describe('createProgressReporter', () => {
  it('posts every stage checkpoint, however close together', async () => {
    const { fetchFn, deps } = harness();
    const reporter = createProgressReporter(target, deps);

    await reporter.stage('downloading');
    await reporter.stage('probing');
    await reporter.stage('encoding');
    await reporter.stage('storing');

    expect(sentBodies(fetchFn)).toEqual([
      { jobToken: 'tok-1', stage: 'downloading' },
      { jobToken: 'tok-1', stage: 'probing' },
      { jobToken: 'tok-1', stage: 'encoding' },
      { jobToken: 'tok-1', stage: 'storing' },
    ]);
  });

  it('holds a percent back until three seconds after the last post', async () => {
    const { fetchFn, clock, deps } = harness();
    const reporter = createProgressReporter(target, deps);
    await reporter.stage('encoding');

    clock.nowMs += 2_999;
    reporter.percent(10);
    await reporter.settle();

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('posts a percent once three seconds have passed, under the current stage', async () => {
    const { fetchFn, clock, deps } = harness();
    const reporter = createProgressReporter(target, deps);
    await reporter.stage('encoding');

    clock.nowMs += 3_000;
    reporter.percent(10.7);
    await reporter.settle();

    expect(sentBodies(fetchFn).at(1)).toEqual({
      jobToken: 'tok-1',
      stage: 'encoding',
      percent: 10,
    });
  });

  it('posts at most one percent every three seconds', async () => {
    const { fetchFn, clock, deps } = harness();
    const reporter = createProgressReporter(target, deps);
    await reporter.stage('encoding');

    for (let second = 1; second <= 9; second += 1) {
      clock.nowMs += 1_000;
      reporter.percent(second * 10);
    }
    await reporter.settle();

    expect(sentBodies(fetchFn).slice(1)).toEqual([
      { jobToken: 'tok-1', stage: 'encoding', percent: 30 },
      { jobToken: 'tok-1', stage: 'encoding', percent: 60 },
      { jobToken: 'tok-1', stage: 'encoding', percent: 90 },
    ]);
  });

  it('does not post a percent that has not moved forward', async () => {
    const { fetchFn, clock, deps } = harness();
    const reporter = createProgressReporter(target, deps);
    await reporter.stage('encoding');
    clock.nowMs += 3_000;
    reporter.percent(50);

    clock.nowMs += 3_000;
    reporter.percent(50);
    await reporter.settle();

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps a percent inside 0 to 100', async () => {
    const { fetchFn, clock, deps } = harness();
    const reporter = createProgressReporter(target, deps);
    await reporter.stage('encoding');

    clock.nowMs += 3_000;
    reporter.percent(180);
    await reporter.settle();

    expect(sentBodies(fetchFn).at(1)).toMatchObject({ percent: 100 });
  });

  it('ignores a percent before any stage', async () => {
    const { fetchFn, deps } = harness();
    const reporter = createProgressReporter(target, deps);

    reporter.percent(10);
    await reporter.settle();

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends a stage only after the percent before it has landed', async () => {
    const order: string[] = [];
    const fetchFn = vi.fn(async (_url: string, init: RequestInit): Promise<Response> => {
      const body = JSON.parse(init.body as string) as { stage: string; percent?: number };
      await Promise.resolve();
      order.push(`${body.stage}:${body.percent ?? '-'}`);
      return okResponse();
    });
    const { clock, deps } = harness(fetchFn);
    const reporter = createProgressReporter(target, deps);
    await reporter.stage('encoding');

    clock.nowMs += 3_000;
    reporter.percent(99);
    await reporter.stage('storing');

    expect(order).toEqual(['encoding:-', 'encoding:99', 'storing:-']);
  });

  it('posts nothing when the event named no progress url', async () => {
    const { fetchFn, deps } = harness();
    const reporter = createProgressReporter(null, deps);

    await reporter.stage('encoding');
    reporter.percent(50);
    await reporter.settle();

    expect(fetchFn).not.toHaveBeenCalled();
  });
});

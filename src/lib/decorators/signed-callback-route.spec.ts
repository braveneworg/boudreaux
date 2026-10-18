// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { z } from 'zod';

import type { JobAdapter, JobTypes } from '@/lib/services/job-runner/types';

import { signedCallbackRoute } from './signed-callback-route';

const afterMock = vi.hoisted(() => vi.fn());
const claimMock = vi.hoisted(() => vi.fn());
const recordProgressMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
const mediaWarnMock = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));

// A next/server stub that mirrors the global setup but also exposes `after`,
// capturing its callback so the post-response work can be run on demand.
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    nextUrl: URL;
    constructor(url: string | URL, options?: RequestInit) {
      super(url, options);
      this.nextUrl = new URL(url);
    }
  }
  class MockNextResponse extends Response {}
  Object.assign(MockNextResponse, {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  });
  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
    after: (cb: () => Promise<void>) => afterMock(cb),
  };
});

vi.mock('@/lib/services/job-runner/job-runner', () => ({
  jobRunner: { claim: claimMock, recordProgress: recordProgressMock, complete: completeMock },
}));

vi.mock('@/lib/utils/logger', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: mediaWarnMock, error: vi.fn() };
  return { loggers: new Proxy({}, { get: () => logger }) };
});

interface TestJobTypes extends JobTypes {
  data: { value: string };
  claim: { slug: string };
  checkpoint: { stage: string };
}

const ID = 'e'.repeat(24);
const SIGNATURE = 't=1790424000,v1=' + 'ab'.repeat(32);
const CAP = 256;

/** The factory reads only the adapter's kind and hands the adapter to the runner. */
const job = { kind: 'video-enrichment' } as JobAdapter<TestJobTypes>;

const callbackSchema = z.object({
  jobToken: z.string().min(1),
  result: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: z.object({ value: z.string() }) }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]),
});

const progressSchema = z.object({ jobToken: z.string().min(1), stage: z.string() });

const limiter = { check: vi.fn(async () => undefined) };

const onComplete = vi.fn();

const callbackRoute = (withHook = true) =>
  signedCallbackRoute({
    job,
    channel: 'callback',
    maxBodyBytes: CAP,
    schema: callbackSchema,
    limiter,
    limit: 20,
    ...(withHook && { onComplete }),
  });

const progressRoute = signedCallbackRoute({
  job,
  channel: 'progress',
  maxBodyBytes: CAP,
  schema: progressSchema,
  limiter,
  limit: 60,
});

const post = (
  handler: ReturnType<typeof signedCallbackRoute>,
  body: string,
  signature: string | null = SIGNATURE
) =>
  handler(
    new NextRequest(`http://localhost:3000/api/things/${ID}/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': '203.0.113.7',
        ...(signature === null ? {} : { 'x-job-signature': signature }),
      },
      body,
    }),
    { params: Promise.resolve({ id: ID }) }
  );

const callbackBody = JSON.stringify({
  jobToken: 'tok',
  result: { ok: true, data: { value: 'x' } },
});
const progressBody = JSON.stringify({ jobToken: 'tok', stage: 'reading' });

/** Runs the work the route scheduled with `after()`. */
const runAfterWork = async (): Promise<void> => {
  for (const [work] of afterMock.mock.calls) {
    await work();
  }
};

beforeEach(() => {
  // The limiter is skipped under E2E mode; pin it off so the 429 case is real.
  vi.stubEnv('E2E_MODE', 'false');
  afterMock.mockReset();
  claimMock.mockReset().mockResolvedValue(null);
  recordProgressMock.mockReset().mockResolvedValue(true);
  completeMock.mockReset().mockResolvedValue(undefined);
  onComplete.mockReset();
});

describe('signedCallbackRoute — callback channel', () => {
  it('answers 413 over the cap without parsing or claiming', async () => {
    const response = await post(callbackRoute(), 'x'.repeat(CAP + 1));

    expect(response.status).toBe(413);
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('accepts a body exactly at the cap', async () => {
    const body = JSON.stringify({ jobToken: 'tok', result: { ok: false, error: '' } });
    const padded = body.replace('"error":""', `"error":"${'e'.repeat(CAP - body.length)}"`);

    const response = await post(callbackRoute(), padded);

    expect(padded).toHaveLength(CAP);
    expect(response.status).toBe(202);
  });

  it('answers 400 Invalid body on malformed JSON', async () => {
    const response = await post(callbackRoute(), '{not json');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid body' });
  });

  it('answers 400 Invalid callback on a schema failure, without claiming', async () => {
    const response = await post(callbackRoute(), JSON.stringify({ jobToken: '' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid callback' });
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('hands the runner the signature header and the exact raw body as the proof', async () => {
    const body = `  ${callbackBody}\n`;

    await post(callbackRoute(), body);

    expect(claimMock.mock.calls).toEqual([
      [job, ID, 'tok', { signature: SIGNATURE, rawBody: body }],
    ]);
  });

  it('hands the runner a null signature when the header is absent', async () => {
    await post(callbackRoute(), callbackBody, null);

    expect(claimMock.mock.calls).toEqual([
      [job, ID, 'tok', { signature: null, rawBody: callbackBody }],
    ]);
  });

  it('answers 202 with no body and schedules nothing when the claim is lost', async () => {
    const response = await post(callbackRoute(), callbackBody);

    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('answers 202 on a won claim, then completes, then runs the hook', async () => {
    claimMock.mockResolvedValueOnce({ slug: 'ceschi' });

    const response = await post(callbackRoute(), callbackBody);
    const completedBeforeAfter = completeMock.mock.calls.length;
    await runAfterWork();

    expect(response.status).toBe(202);
    expect(completedBeforeAfter).toBe(0);
    expect(completeMock.mock.calls).toEqual([
      [job, ID, { ok: true, data: { value: 'x' } }, { slug: 'ceschi' }],
    ]);
    expect(onComplete.mock.calls).toEqual([[{ slug: 'ceschi' }]]);
    expect(completeMock.mock.invocationCallOrder[0]).toBeLessThan(
      onComplete.mock.invocationCallOrder[0]
    );
  });

  it('completes a won claim without a hook', async () => {
    claimMock.mockResolvedValueOnce({ slug: 'ceschi' });

    await post(callbackRoute(false), callbackBody);
    await runAfterWork();

    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('answers 429 when the limiter refuses', async () => {
    limiter.check.mockRejectedValueOnce(new Error('rate limited'));

    const response = await post(callbackRoute(), callbackBody);

    expect(response.status).toBe(429);
  });
});

describe('signedCallbackRoute — progress channel', () => {
  it('answers 413 over the cap without recording', async () => {
    const response = await post(progressRoute, 'x'.repeat(CAP + 1));

    expect(response.status).toBe(413);
    expect(recordProgressMock).not.toHaveBeenCalled();
  });

  it('answers 202 on malformed JSON without recording', async () => {
    const response = await post(progressRoute, '{not json');

    expect(response.status).toBe(202);
    expect(recordProgressMock).not.toHaveBeenCalled();
  });

  it('answers 202 on a schema failure and warns with the kind and the issue summary only', async () => {
    const body = JSON.stringify({ jobToken: 'tok', stage: 7, secret: 'raw-body-marker' });

    const response = await post(progressRoute, body);

    expect(response.status).toBe(202);
    expect(recordProgressMock).not.toHaveBeenCalled();
    expect(mediaWarnMock.mock.calls).toEqual([
      [
        'job_progress_schema_rejected',
        {
          kind: 'video-enrichment',
          issues: [{ code: 'invalid_type', path: ['stage'], message: expect.any(String) }],
        },
      ],
    ]);
    expect(JSON.stringify(mediaWarnMock.mock.calls)).not.toContain('raw-body-marker');
  });

  it('records the checkpoint without its token, under the exact proof, and answers 202', async () => {
    const response = await post(progressRoute, progressBody);

    expect(response.status).toBe(202);
    expect(recordProgressMock.mock.calls).toEqual([
      [
        job,
        ID,
        {
          jobToken: 'tok',
          checkpoint: { stage: 'reading' },
          proof: { signature: SIGNATURE, rawBody: progressBody },
        },
      ],
    ]);
  });

  it('answers 202 whether or not the checkpoint was written', async () => {
    recordProgressMock.mockResolvedValueOnce(false);

    const response = await post(progressRoute, progressBody);

    expect(response.status).toBe(202);
  });
});

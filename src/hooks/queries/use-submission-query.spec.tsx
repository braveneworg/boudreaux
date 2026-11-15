// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import type { SubmissionViewPayload } from '@/lib/types/domain/submission';

import { SUBMISSION_STALE_MS, useSubmissionQuery } from './use-submission-query';

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => useQueryMock(options),
}));

interface SubmissionQueryOptions {
  queryKey: unknown[];
  enabled?: boolean;
  staleTime?: number;
  queryFn: (ctx: { signal?: AbortSignal }) => Promise<SubmissionViewPayload | null>;
}

const ID = 'c'.repeat(24);

const payload: SubmissionViewPayload = {
  id: ID,
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '',
  writingHtml: '<p>Poem</p>',
  links: [],
  listed: true,
  status: 'APPROVED',
  rejectionReason: null,
  owner: { username: 'ada', gravatarHash: 'abc123' },
  viewer: 'public',
  isPublic: true,
  queuePosition: null,
  attachments: [],
};

const getOptions = (
  id: string | null = ID,
  overrides: QueryOptionsOverride<SubmissionViewPayload | null> = {}
): SubmissionQueryOptions => {
  useQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useSubmissionQuery(id, overrides));
  return useQueryMock.mock.calls.at(-1)?.[0] as SubmissionQueryOptions;
};

const stubFetch = (body: unknown, status = 200): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => useQueryMock.mockReset());

afterEach(() => vi.unstubAllGlobals());

describe('useSubmissionQuery', () => {
  it('keys the query by the submission', () => {
    expect(getOptions().queryKey).toEqual(['submissions', 'detail', ID]);
  });

  it('reads the submission from its route, forwarding the abort signal', async () => {
    const fetchMock = stubFetch(payload);
    const { signal } = new AbortController();

    await expect(getOptions().queryFn({ signal })).resolves.toEqual(payload);

    expect(fetchMock.mock.calls).toEqual([[`/api/community/submissions/${ID}`, { signal }]]);
  });

  it('answers null for a submission the reader may not open', async () => {
    stubFetch({ error: 'Not found' }, 404);

    await expect(getOptions().queryFn({})).resolves.toBeNull();
  });

  it('throws when the read fails', async () => {
    stubFetch({ error: 'Internal server error' }, 500);

    await expect(getOptions().queryFn({})).rejects.toThrow('Failed to load the submission');
  });

  it('throws on a body that is not a submission', async () => {
    stubFetch({ id: ID });

    await expect(getOptions().queryFn({})).rejects.toThrow(/Invalid response/);
  });

  it('asks for nothing while no submission is open', () => {
    expect(getOptions(null).enabled).toBe(false);
  });

  it('stays off without a submission, whatever the caller asks', () => {
    expect(getOptions(null, { enabled: true }).enabled).toBe(false);
  });

  it('lets the caller hold a read back', () => {
    expect(getOptions(ID, { enabled: false }).enabled).toBe(false);
  });

  it('reads again once what it holds is half a minute old', () => {
    expect(getOptions().staleTime).toBe(SUBMISSION_STALE_MS);
    expect(SUBMISSION_STALE_MS).toBe(30_000);
  });

  it('spreads the caller’s overrides over its defaults', () => {
    expect(getOptions(ID, { staleTime: 0 }).staleTime).toBe(0);
  });
});

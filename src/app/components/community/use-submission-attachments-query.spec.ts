/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';

import { queryKeys } from '@/lib/query-keys';

import { useSubmissionAttachmentsQuery } from './use-submission-attachments-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

interface QueryOptionsShape {
  queryKey: unknown[];
  enabled: boolean;
  staleTime: number;
  queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
  refetchInterval: (query: {
    state: { data?: { attachments: Array<{ state: string }> } };
  }) => number | false;
}

const SUBMISSION_ID = 'c'.repeat(24);

const attachment = {
  id: 'e'.repeat(24),
  kind: 'IMAGE',
  fileName: 'show.jpg',
  state: 'ready',
  error: null,
  progress: null,
  url: 'https://signed.example/copy.jpg',
  cardUrl: 'https://signed.example/card.webp',
  posterUrl: null,
  width: 1200,
  height: 800,
  durationSeconds: null,
};

const payload = {
  status: 'DRAFT',
  updatedAt: '2026-11-11T12:00:00.000Z',
  attachments: [attachment],
};

/** The options the hook handed `useQuery` on its first render. */
const optionsFor = (
  submissionId = SUBMISSION_ID,
  overrides: Parameters<typeof useSubmissionAttachmentsQuery>[1] = {}
): QueryOptionsShape => {
  renderHook(() => useSubmissionAttachmentsQuery(submissionId, overrides));

  return mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
};

beforeEach(() => {
  mockUseQuery.mockReset().mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSubmissionAttachmentsQuery', () => {
  it('uses the shared submissions.attachments query key', () => {
    expect(optionsFor().queryKey).toEqual(queryKeys.submissions.attachments(SUBMISSION_ID));
  });

  it('is never fresh, so a mount after an upload reads again', () => {
    expect(optionsFor().staleTime).toBe(0);
  });

  it('is disabled without a submission', () => {
    expect(optionsFor('').enabled).toBe(false);
  });

  it('honours a caller that disables it', () => {
    expect(optionsFor(SUBMISSION_ID, { enabled: false }).enabled).toBe(false);
  });

  it('polls while an attachment is processing', () => {
    const interval = optionsFor().refetchInterval({
      state: { data: { attachments: [{ state: 'ready' }, { state: 'processing' }] } },
    });

    expect(interval).toBe(2500);
  });

  it('stops polling once nothing is processing', () => {
    const interval = optionsFor().refetchInterval({
      state: { data: { attachments: [{ state: 'ready' }, { state: 'failed' }] } },
    });

    expect(interval).toBe(false);
  });

  it('does not poll before the first answer', () => {
    expect(optionsFor().refetchInterval({ state: {} })).toBe(false);
  });

  it('fetches the submission’s list, forwarding the abort signal', async () => {
    const fetchMock = vi.fn(async () => Response.json(payload));
    vi.stubGlobal('fetch', fetchMock);
    const { signal } = new AbortController();

    await optionsFor().queryFn({ signal });

    expect(fetchMock.mock.calls.at(0)).toEqual([
      `/api/community/submissions/${SUBMISSION_ID}/attachments`,
      expect.objectContaining({ signal }),
    ]);
  });

  it('answers the parsed list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(payload))
    );

    await expect(optionsFor().queryFn({ signal: new AbortController().signal })).resolves.toEqual(
      payload
    );
  });

  it('rejects an answer that is not the list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ attachments: [{ state: 'uploading' }] }))
    );

    await expect(optionsFor().queryFn({ signal: new AbortController().signal })).rejects.toThrow();
  });
});

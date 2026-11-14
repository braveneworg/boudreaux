/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { StrictMode } from 'react';

import { render } from '@testing-library/react';

import { SubmissionViewBeacon } from './submission-view-beacon';

const SUBMISSION_ID = 'c'.repeat(24);
const OTHER_ID = 'd'.repeat(24);

const fetchMock = vi.fn<typeof fetch>();

const viewPath = (id: string): string => `/api/community/submissions/${id}/view`;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SubmissionViewBeacon', () => {
  it('renders nothing', () => {
    const { container } = render(<SubmissionViewBeacon submissionId={SUBMISSION_ID} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('asks once for the opening to be counted, in a request that outlives the page', () => {
    render(<SubmissionViewBeacon submissionId={SUBMISSION_ID} />);

    expect(fetchMock.mock.calls).toEqual([
      [viewPath(SUBMISSION_ID), { method: 'POST', keepalive: true }],
    ]);
  });

  it('does not ask again when the page renders again', () => {
    const { rerender } = render(<SubmissionViewBeacon submissionId={SUBMISSION_ID} />);

    rerender(<SubmissionViewBeacon submissionId={SUBMISSION_ID} />);

    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it('asks for another submission when the page shows another', () => {
    const { rerender } = render(<SubmissionViewBeacon submissionId={SUBMISSION_ID} />);

    rerender(<SubmissionViewBeacon submissionId={OTHER_ID} />);

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      viewPath(SUBMISSION_ID),
      viewPath(OTHER_ID),
    ]);
  });

  it('leaves a failed request alone: nothing on the page depends on it', async () => {
    // Only the hook may handle this rejection, or the case could never
    // fail. So `fetch` is a plain function here: a mock records how its
    // promise settles, which handles the rejection, and so would a catch
    // in the test.
    let asked = 0;
    vi.stubGlobal('fetch', () => {
      asked += 1;

      return Promise.reject(new Error('offline'));
    });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    render(<SubmissionViewBeacon submissionId={SUBMISSION_ID} />);
    // A rejection nobody handled is reported a macrotask later.
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.removeListener('unhandledRejection', unhandled);

    expect(asked).toBe(1);
    expect(unhandled.mock.calls).toEqual([]);
  });

  it('asks once under a development double-mount, as a production page does', () => {
    // Two requests at once from a guest with no cookie yet are identified as
    // two visitors, and one opening would be counted under both.
    render(
      <StrictMode>
        <SubmissionViewBeacon submissionId={SUBMISSION_ID} />
      </StrictMode>
    );

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([viewPath(SUBMISSION_ID)]);
  });

  it('asks again when the page is opened again', () => {
    render(<SubmissionViewBeacon submissionId={SUBMISSION_ID} />).unmount();

    render(<SubmissionViewBeacon submissionId={SUBMISSION_ID} />);

    expect(fetchMock.mock.calls).toHaveLength(2);
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SubmissionShare } from './submission-share';

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('next/dynamic', () => ({
  default: () =>
    function SocialShareWidgetStub({ url }: { url: string }) {
      return <div data-testid="social-share-widget" data-url={url} />;
    },
}));

const ID = 'c'.repeat(24);
const HOST = 'https://fakefour.example';
const URL_TO_SHARE = `${HOST}/community/${ID}`;

const writeText = vi.fn();

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_HOST_NAME', HOST);
  writeText.mockReset();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('SubmissionShare', () => {
  it('shares the submission’s own link on every network', () => {
    render(<SubmissionShare submissionId={ID} title="Bus poem" />);

    expect(screen.getByTestId('social-share-widget')).toHaveAttribute('data-url', URL_TO_SHARE);
  });

  it('copies the submission’s link and says so', async () => {
    writeText.mockResolvedValueOnce(undefined);
    render(<SubmissionShare submissionId={ID} title="Bus poem" />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(writeText.mock.calls).toEqual([[URL_TO_SHARE]]);
    await waitFor(() => expect(mockToast.success.mock.calls).toEqual([['Link copied']]));
  });

  it('says so when the link could not be copied', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    render(<SubmissionShare submissionId={ID} title="Bus poem" />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() =>
      expect(mockToast.error.mock.calls).toEqual([
        ['Could not copy the link. Copy it from the address bar.'],
      ])
    );
  });

  it('labels the row with the title it shares', () => {
    render(<SubmissionShare submissionId={ID} title="Bus poem" />);

    expect(screen.getByRole('group', { name: 'Share Bus poem' })).toBeInTheDocument();
  });
});

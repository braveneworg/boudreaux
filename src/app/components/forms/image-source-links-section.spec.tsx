/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ImageLinksStatusResponse } from '@/lib/validation/image-links-schema';
import { CLIENT_POLL_DEADLINE_MS, STALE_JOB_TIMEOUT_MESSAGE } from '@/utils/async-job-lifecycle';

import { ImageSourceLinksSection } from './image-source-links-section';

const addImageSourceLink = vi.fn();
const removeImageSourceLink = vi.fn();
const generateImagesFromLinksAsync = vi.fn();
vi.mock('./_hooks/mutations/use-image-source-link-mutations', () => ({
  useAddImageSourceLinkMutation: () => ({
    addImageSourceLink,
    isAddingImageSourceLink: false,
  }),
  useRemoveImageSourceLinkMutation: () => ({
    removeImageSourceLink,
    isRemovingImageSourceLink: false,
  }),
  useGenerateImagesFromLinksMutation: () => ({
    generateImagesFromLinksAsync,
    isTriggeringImagesFromLinks: false,
  }),
}));

const statusData = vi.hoisted(() => ({ current: null as ImageLinksStatusResponse | null }));
vi.mock('./_hooks/use-artist-image-links-query', () => ({
  useArtistImageLinksQuery: () => ({
    isPending: false,
    error: Error('none'),
    data: statusData.current,
    refetch: vi.fn(),
  }),
}));

const invalidateQueries = vi.fn(() => Promise.resolve());
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (msg: string) => toastError(msg), success: (msg: string) => toastSuccess(msg) },
}));

const idle = (overrides: Partial<ImageLinksStatusResponse> = {}): ImageLinksStatusResponse => ({
  status: null,
  error: null,
  addedCount: null,
  links: [],
  ...overrides,
});

const twoLinks = [
  { id: 'l1', label: 'press.test', url: 'https://press.test/kit' },
  { id: 'l2', label: 'photos.test', url: 'https://photos.test/a.jpg' },
];

const renderSection = (props: { disabled?: boolean } = {}) =>
  render(<ImageSourceLinksSection artistId="artist-1" {...props} />);

beforeEach(() => {
  statusData.current = idle();
  generateImagesFromLinksAsync.mockResolvedValue({ success: true, status: 'pending' });
});

describe('ImageSourceLinksSection', () => {
  it('renders a labelled region with the link input, Add and Generate buttons', () => {
    renderSection();
    const region = screen.getByRole('region', { name: 'Image sources' });
    expect(region).toBeInTheDocument();
    expect(screen.getByLabelText('Image source link')).toHaveAttribute('type', 'url');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Generate images' })).toBeDisabled();
  });

  it('adds a valid link via the plus button and clears the draft', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText('Image source link'), 'https://press.test/kit');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(addImageSourceLink.mock.calls).toEqual([['https://press.test/kit']]);
    expect(screen.getByLabelText('Image source link')).toHaveValue('');
  });

  it('adds on Enter without submitting the surrounding form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ImageSourceLinksSection artistId="artist-1" />
      </form>
    );

    await user.type(screen.getByLabelText('Image source link'), 'https://press.test/kit{Enter}');

    expect(addImageSourceLink.mock.calls).toEqual([['https://press.test/kit']]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a non-http link with a toast and keeps the draft', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText('Image source link'), 'ftp://press.test/kit{Enter}');

    expect(toastError).toHaveBeenCalledWith('Links must start with http:// or https://');
    expect(addImageSourceLink).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Image source link')).toHaveValue('ftp://press.test/kit');
  });

  it('lists stored links as removable pills and removes by row id', async () => {
    const user = userEvent.setup();
    statusData.current = idle({ links: twoLinks });
    renderSection();

    const list = screen.getByRole('list', { name: 'Image source links' });
    expect(list).toHaveTextContent('https://press.test/kit');
    await user.click(screen.getByRole('button', { name: 'Remove https://photos.test/a.jpg' }));

    expect(removeImageSourceLink.mock.calls).toEqual([['l2']]);
  });

  it('enables Generate images once a link exists and triggers the job', async () => {
    const user = userEvent.setup();
    statusData.current = idle({ links: twoLinks });
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Generate images' }));

    expect(generateImagesFromLinksAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Generating images…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Reading links for photos');
  });

  it('toasts when the trigger is rejected and stays idle', async () => {
    const user = userEvent.setup();
    statusData.current = idle({ links: twoLinks });
    generateImagesFromLinksAsync.mockResolvedValueOnce({ success: false, error: 'Nope' });
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Generate images' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Nope'));
    expect(screen.getByRole('button', { name: 'Generate images' })).toBeEnabled();
  });

  it('shows the busy state for a job observed in flight on mount', () => {
    statusData.current = idle({ status: 'processing', links: twoLinks });
    renderSection();

    expect(screen.getByRole('button', { name: 'Generating images…' })).toBeDisabled();
    expect(screen.getByLabelText('Image source link')).toBeDisabled();
  });

  it('toasts the added count and refreshes the pool when a tracked job succeeds', () => {
    statusData.current = idle({ status: 'processing', links: twoLinks });
    const { rerender } = renderSection();

    statusData.current = idle({ status: 'succeeded', addedCount: 3, links: twoLinks });
    rerender(<ImageSourceLinksSection artistId="artist-1" />);

    expect(toastSuccess).toHaveBeenCalledWith('Added 3 images to the pool.');
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['artists', 'bioGeneration', 'artist-1'] }],
      [{ queryKey: ['artists', 'bioImages', 'artist-1'] }],
    ]);
    expect(screen.getByRole('button', { name: 'Generate images' })).toBeEnabled();
  });

  it('uses singular and empty copy for the completion toast', () => {
    statusData.current = idle({ status: 'processing', links: twoLinks });
    const { rerender } = renderSection();
    statusData.current = idle({ status: 'succeeded', addedCount: 1, links: twoLinks });
    rerender(<ImageSourceLinksSection artistId="artist-1" />);
    expect(toastSuccess).toHaveBeenCalledWith('Added 1 image to the pool.');

    statusData.current = idle({ status: 'processing', links: twoLinks });
    rerender(<ImageSourceLinksSection artistId="artist-1" />);
    statusData.current = idle({ status: 'succeeded', addedCount: 0, links: twoLinks });
    rerender(<ImageSourceLinksSection artistId="artist-1" />);
    expect(toastSuccess).toHaveBeenCalledWith('No new images found on those pages.');
  });

  it('toasts the error when a tracked job fails', () => {
    statusData.current = idle({ status: 'processing', links: twoLinks });
    const { rerender } = renderSection();

    statusData.current = idle({ status: 'failed', error: 'Jina down', links: twoLinks });
    rerender(<ImageSourceLinksSection artistId="artist-1" />);

    expect(toastError).toHaveBeenCalledWith('Jina down');
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('does not toast a stale succeeded status on mount', () => {
    statusData.current = idle({ status: 'succeeded', addedCount: 5, links: twoLinks });
    renderSection();

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Generate images' })).toBeEnabled();
  });

  it('gives up with the timeout message when the job never resolves', () => {
    vi.useFakeTimers();
    try {
      statusData.current = idle({ status: 'processing', links: twoLinks });
      renderSection();

      act(() => {
        vi.advanceTimersByTime(CLIENT_POLL_DEADLINE_MS + 1000);
      });

      expect(toastError).toHaveBeenCalledWith(STALE_JOB_TIMEOUT_MESSAGE);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables every control when the parent disables the section', () => {
    statusData.current = idle({ links: twoLinks });
    renderSection({ disabled: true });

    expect(screen.getByLabelText('Image source link')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Generate images' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove https://press.test/kit' })).toBeDisabled();
  });
});

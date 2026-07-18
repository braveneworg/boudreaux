/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { useInfiniteVideosQuery } from '@/app/hooks/use-infinite-videos-query';

import { VideoDataView } from './video-data-view';

const mocks = vi.hoisted(() => ({
  publishVideoAsync: vi.fn(),
  unpublishVideoAsync: vi.fn(),
  archiveVideoAsync: vi.fn(),
  restoreVideoAsync: vi.fn(),
  deleteVideoAsync: vi.fn(),
}));

vi.mock('@/app/hooks/use-infinite-videos-query', () => ({
  useInfiniteVideosQuery: vi.fn(),
}));

vi.mock('@/app/hooks/mutations/use-video-mutations', () => ({
  usePublishVideoMutation: () => ({ publishVideoAsync: mocks.publishVideoAsync }),
  useUnpublishVideoMutation: () => ({ unpublishVideoAsync: mocks.unpublishVideoAsync }),
  useArchiveVideoMutation: () => ({ archiveVideoAsync: mocks.archiveVideoAsync }),
  useRestoreVideoMutation: () => ({ restoreVideoAsync: mocks.restoreVideoAsync }),
  useDeleteVideoMutation: () => ({ deleteVideoAsync: mocks.deleteVideoAsync }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

interface MockCardProps {
  video: { id: string; title: string };
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

vi.mock('./components/video-admin-card', () => ({
  VideoAdminCard: ({
    video,
    onPublish,
    onUnpublish,
    onArchive,
    onRestore,
    onDelete,
  }: MockCardProps) => (
    <div>
      <span>{video.title}</span>
      <button onClick={() => onPublish(video.id)}>publish-{video.id}</button>
      <button onClick={() => onUnpublish(video.id)}>unpublish-{video.id}</button>
      <button onClick={() => onArchive(video.id)}>archive-{video.id}</button>
      <button onClick={() => onRestore(video.id)}>restore-{video.id}</button>
      <button onClick={() => onDelete(video.id)}>delete-{video.id}</button>
    </div>
  ),
}));

const toInfiniteResult = (rows: unknown[]) => ({
  isPending: false,
  isFetching: false,
  error: null,
  data: { pages: [{ rows, nextSkip: null }] },
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
});

const mockRow = { id: 'video-1', title: 'Live Set' };

beforeEach(() => {
  mocks.publishVideoAsync.mockResolvedValue({ success: true });
  mocks.unpublishVideoAsync.mockResolvedValue({ success: true });
  mocks.archiveVideoAsync.mockResolvedValue({ success: true });
  mocks.restoreVideoAsync.mockResolvedValue({ success: true });
  mocks.deleteVideoAsync.mockResolvedValue({ success: true });
  vi.mocked(useInfiniteVideosQuery).mockReturnValue(toInfiniteResult([mockRow]) as never);
});

describe('VideoDataView filters', () => {
  it('restores sort and archived filters across unmount and remount', async () => {
    const { unmount } = render(<VideoDataView />);
    await userEvent.click(screen.getByRole('radio', { name: /oldest first/i }));
    await userEvent.click(screen.getByRole('switch', { name: /show archived/i }));

    unmount();
    render(<VideoDataView />);

    expect(screen.getByRole('radio', { name: /oldest first/i })).toBeChecked();
    expect(screen.getByRole('switch', { name: /show archived/i })).toBeChecked();
  });

  it('defaults to no publish filter with both toggles on', () => {
    render(<VideoDataView />);

    expect(useInfiniteVideosQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: '', published: null, archived: false, sort: 'desc' }),
      expect.objectContaining({ enabled: true })
    );
  });

  it('narrows to published-only when unpublished is toggled off', async () => {
    render(<VideoDataView />);

    await userEvent.click(screen.getByRole('switch', { name: /show unpublished/i }));

    expect(useInfiniteVideosQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ published: true }),
      expect.objectContaining({ enabled: true })
    );
  });

  it('narrows to unpublished-only when published is toggled off', async () => {
    render(<VideoDataView />);

    await userEvent.click(screen.getByRole('switch', { name: /show published/i }));

    expect(useInfiniteVideosQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ published: false }),
      expect.objectContaining({ enabled: true })
    );
  });

  it('collapses to no publish filter when both toggles are off', async () => {
    render(<VideoDataView />);

    await userEvent.click(screen.getByRole('switch', { name: /show published/i }));
    await userEvent.click(screen.getByRole('switch', { name: /show unpublished/i }));

    expect(useInfiniteVideosQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ published: null }),
      expect.objectContaining({ enabled: true })
    );
  });

  it('requests archived videos when the archived toggle is on', async () => {
    render(<VideoDataView />);

    await userEvent.click(screen.getByRole('switch', { name: /show archived/i }));

    expect(useInfiniteVideosQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ archived: true }),
      expect.objectContaining({ enabled: true })
    );
  });

  it('sorts oldest first when that toggle is selected', async () => {
    render(<VideoDataView />);

    await userEvent.click(screen.getByRole('radio', { name: /oldest first/i }));

    expect(useInfiniteVideosQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'asc' }),
      expect.objectContaining({ enabled: true })
    );
  });

  it('returns to newest first when that toggle is reselected', async () => {
    render(<VideoDataView />);

    await userEvent.click(screen.getByRole('radio', { name: /oldest first/i }));
    await userEvent.click(screen.getByRole('radio', { name: /newest first/i }));

    expect(useInfiniteVideosQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'desc' }),
      expect.objectContaining({ enabled: true })
    );
  });

  it('keeps the current sort when the selection is cleared', async () => {
    render(<VideoDataView />);

    await userEvent.click(screen.getByRole('radio', { name: /newest first/i }));

    expect(useInfiniteVideosQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'desc' }),
      expect.objectContaining({ enabled: true })
    );
  });

  it('forwards the debounced search term', async () => {
    render(<VideoDataView />);

    await userEvent.type(screen.getByRole('searchbox'), 'jazz');

    await waitFor(() =>
      expect(useInfiniteVideosQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'jazz' }),
        expect.objectContaining({ enabled: true })
      )
    );
  });
});

describe('VideoDataView states', () => {
  it('shows a loading state while pending', () => {
    vi.mocked(useInfiniteVideosQuery).mockReturnValue({
      ...toInfiniteResult([]),
      isPending: true,
      data: undefined,
    } as never);

    render(<VideoDataView />);

    expect(screen.getByText(/loading videos/i)).toBeInTheDocument();
  });

  it('shows an error state with a retry action', async () => {
    const refetch = vi.fn();
    vi.mocked(useInfiniteVideosQuery).mockReturnValue({
      ...toInfiniteResult([]),
      error: new Error('boom'),
      data: undefined,
      refetch,
    } as never);

    render(<VideoDataView />);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state linking to the new video page', () => {
    vi.mocked(useInfiniteVideosQuery).mockReturnValue(toInfiniteResult([]) as never);

    render(<VideoDataView />);

    expect(screen.getByText(/no videos yet/i)).toBeInTheDocument();
  });

  it('links the empty state to the new video page', () => {
    vi.mocked(useInfiniteVideosQuery).mockReturnValue(toInfiniteResult([]) as never);

    render(<VideoDataView />);

    const links = screen.getAllByRole('link', { name: /new video/i });
    expect(links.some((link) => link.getAttribute('href') === '/admin/videos/new')).toBe(true);
  });

  it('renders a card for each loaded video', () => {
    render(<VideoDataView />);

    expect(screen.getByText('Live Set')).toBeInTheDocument();
  });

  it('always offers a New Video affordance', () => {
    render(<VideoDataView />);

    expect(screen.getByRole('link', { name: /new video/i })).toHaveAttribute(
      'href',
      '/admin/videos/new'
    );
  });
});

describe('VideoDataView mutations', () => {
  it('publishes a video and toasts success', async () => {
    const refetch = vi.fn();
    vi.mocked(useInfiniteVideosQuery).mockReturnValue({
      ...toInfiniteResult([mockRow]),
      refetch,
    } as never);

    render(<VideoDataView />);
    await userEvent.click(screen.getByRole('button', { name: 'publish-video-1' }));

    await waitFor(() =>
      expect(mocks.publishVideoAsync).toHaveBeenCalledWith({ videoId: 'video-1' })
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it('refetches after a successful mutation', async () => {
    const refetch = vi.fn();
    vi.mocked(useInfiniteVideosQuery).mockReturnValue({
      ...toInfiniteResult([mockRow]),
      refetch,
    } as never);

    render(<VideoDataView />);
    await userEvent.click(screen.getByRole('button', { name: 'publish-video-1' }));

    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it('toasts the error message when a mutation fails', async () => {
    mocks.publishVideoAsync.mockResolvedValueOnce({ success: false, error: 'no permission' });

    render(<VideoDataView />);
    await userEvent.click(screen.getByRole('button', { name: 'publish-video-1' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('no permission'));
  });

  it('falls back to a generic message when a failure has no error text', async () => {
    mocks.publishVideoAsync.mockResolvedValueOnce({ success: false });

    render(<VideoDataView />);
    await userEvent.click(screen.getByRole('button', { name: 'publish-video-1' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Something went wrong.'));
  });

  it('toasts a generic error when a mutation throws', async () => {
    mocks.publishVideoAsync.mockRejectedValueOnce(new Error('network'));

    render(<VideoDataView />);
    await userEvent.click(screen.getByRole('button', { name: 'publish-video-1' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('unpublishes a video via its mutation', async () => {
    render(<VideoDataView />);
    await userEvent.click(screen.getByRole('button', { name: 'unpublish-video-1' }));

    await waitFor(() =>
      expect(mocks.unpublishVideoAsync).toHaveBeenCalledWith({ videoId: 'video-1' })
    );
  });

  it('archives a video via its mutation', async () => {
    render(<VideoDataView />);
    await userEvent.click(screen.getByRole('button', { name: 'archive-video-1' }));

    await waitFor(() =>
      expect(mocks.archiveVideoAsync).toHaveBeenCalledWith({ videoId: 'video-1' })
    );
  });

  it('restores a video via its mutation', async () => {
    render(<VideoDataView />);
    await userEvent.click(screen.getByRole('button', { name: 'restore-video-1' }));

    await waitFor(() =>
      expect(mocks.restoreVideoAsync).toHaveBeenCalledWith({ videoId: 'video-1' })
    );
  });

  it('deletes a video via its mutation', async () => {
    render(<VideoDataView />);
    await userEvent.click(screen.getByRole('button', { name: 'delete-video-1' }));

    await waitFor(() =>
      expect(mocks.deleteVideoAsync).toHaveBeenCalledWith({ videoId: 'video-1' })
    );
  });
});

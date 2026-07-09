/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { VideoRow } from '@/lib/validation/video-schema';

import { VideoAdminCard } from './video-admin-card';

vi.mock('@/components/ui/video/video-player', () => ({
  VideoPlayer: ({ src }: { src: string | null }) => (
    <div data-testid="video-player" data-src={src ?? ''} />
  ),
}));

const baseVideo: VideoRow = {
  id: 'video-1',
  title: 'Live Set',
  artist: 'The Band',
  category: 'MUSIC',
  description: null,
  releasedOn: new Date('2024-03-01T00:00:00Z'),
  durationSeconds: 185,
  s3Key: 'videos/video-1/live.mp4',
  fileName: 'live.mp4',
  fileSize: 10_485_760n,
  mimeType: 'video/mp4',
  posterUrl: 'https://cdn.example/poster.jpg',
  publishedAt: null,
  archivedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-02-01T00:00:00Z'),
  streamUrl: 'https://signed.example/live.mp4',
};

const noopHandlers = {
  onPublish: vi.fn(),
  onUnpublish: vi.fn(),
  onArchive: vi.fn(),
  onRestore: vi.fn(),
  onDelete: vi.fn(),
};

const renderCard = (video: VideoRow = baseVideo, handlers = noopHandlers) =>
  render(<VideoAdminCard video={video} {...handlers} />);

describe('VideoAdminCard', () => {
  it('renders the video title', () => {
    renderCard();

    expect(screen.getByText('Live Set')).toBeInTheDocument();
  });

  it('renders the artist', () => {
    renderCard();

    expect(screen.getByText('The Band')).toBeInTheDocument();
  });

  it('labels a MUSIC video as "Music"', () => {
    renderCard();

    expect(screen.getByText('Music')).toBeInTheDocument();
  });

  it('labels an INFORMATIONAL video as "Informational"', () => {
    renderCard({ ...baseVideo, category: 'INFORMATIONAL' });

    expect(screen.getByText('Informational')).toBeInTheDocument();
  });

  it('renders the formatted duration', () => {
    renderCard();

    expect(screen.getByText('3:05')).toBeInTheDocument();
  });

  it('renders the file name', () => {
    renderCard();

    expect(screen.getByText(/live\.mp4/)).toBeInTheDocument();
  });

  it('renders the formatted file size', () => {
    renderCard();

    expect(screen.getByText(/10 MB/)).toBeInTheDocument();
  });

  it('omits the size when the file size is unknown', () => {
    renderCard({ ...baseVideo, fileSize: null });

    expect(screen.getByText('live.mp4')).toBeInTheDocument();
  });

  it('renders a dash for an unknown duration', () => {
    renderCard({ ...baseVideo, durationSeconds: null });

    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('passes the resolved stream URL to the player', () => {
    renderCard();

    expect(screen.getByTestId('video-player')).toHaveAttribute(
      'data-src',
      'https://signed.example/live.mp4'
    );
  });

  it('links Edit to the video edit route', () => {
    renderCard();

    expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute(
      'href',
      '/admin/videos/video-1'
    );
  });

  it('shows a Draft badge for an unpublished video', () => {
    renderCard();

    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('offers a Publish action for an unpublished video', () => {
    renderCard();

    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('shows a Published badge for a published video', () => {
    renderCard({ ...baseVideo, publishedAt: new Date('2024-02-15T00:00:00Z') });

    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('offers an Unpublish action for a published video', () => {
    renderCard({ ...baseVideo, publishedAt: new Date('2024-02-15T00:00:00Z') });

    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
  });

  it('offers an Archive action for a non-archived video', () => {
    renderCard();

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('does not show an Archived badge for a non-archived video', () => {
    renderCard();

    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });

  it('shows an Archived badge for an archived video', () => {
    renderCard({ ...baseVideo, archivedAt: new Date('2024-02-20T00:00:00Z') });

    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('offers a Restore action for an archived video', () => {
    renderCard({ ...baseVideo, archivedAt: new Date('2024-02-20T00:00:00Z') });

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('warns that deleting removes the video and its files from storage', async () => {
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      screen.getByText(/permanently removes the video and its files from storage/i)
    ).toBeInTheDocument();
  });

  it('publishes the video via onPublish', async () => {
    const onPublish = vi.fn();
    renderCard(baseVideo, { ...noopHandlers, onPublish });

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onPublish).toHaveBeenCalledWith('video-1');
  });

  it('unpublishes the video via onUnpublish', async () => {
    const onUnpublish = vi.fn();
    renderCard(
      { ...baseVideo, publishedAt: new Date('2024-02-15T00:00:00Z') },
      { ...noopHandlers, onUnpublish }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onUnpublish).toHaveBeenCalledWith('video-1');
  });

  it('archives the video via onArchive', async () => {
    const onArchive = vi.fn();
    renderCard(baseVideo, { ...noopHandlers, onArchive });

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onArchive).toHaveBeenCalledWith('video-1');
  });

  it('restores the video via onRestore', async () => {
    const onRestore = vi.fn();
    renderCard(
      { ...baseVideo, archivedAt: new Date('2024-02-20T00:00:00Z') },
      { ...noopHandlers, onRestore }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onRestore).toHaveBeenCalledWith('video-1');
  });

  it('deletes the video via onDelete', async () => {
    const onDelete = vi.fn();
    renderCard(baseVideo, { ...noopHandlers, onDelete });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onDelete).toHaveBeenCalledWith('video-1');
  });
});

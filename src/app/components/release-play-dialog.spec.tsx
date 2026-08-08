/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ReleasePlayDialog } from './release-play-dialog';

const mockUseReleaseQuery = vi.fn();

vi.mock('@/hooks/queries/use-release-query', () => ({
  useReleaseQuery: (releaseId: string, options?: { enabled?: boolean }) =>
    mockUseReleaseQuery(releaseId, options) as unknown,
}));

// Stub ReleasePlayer — its behavior is covered by release-player.spec. Here we
// only assert the dialog mounts it with the fetched release, autoplay, and the
// gesture-primed element supplier.
vi.mock('./release-player', () => ({
  ReleasePlayer: ({
    release,
    autoPlay,
    releaseId,
    releaseTitle,
    takeMediaEl,
  }: {
    release: { id: string };
    autoPlay?: boolean;
    releaseId: string;
    releaseTitle?: string;
    takeMediaEl?: () => HTMLAudioElement | null;
  }) => (
    <div
      data-testid="release-player"
      data-release={release.id}
      data-autoplay={autoPlay?.toString()}
      data-release-id={releaseId}
      data-release-title={releaseTitle}
      data-has-take-media-el={(takeMediaEl !== undefined).toString()}
    />
  ),
}));

const queryState = (
  overrides: Partial<{
    isPending: boolean;
    isError: boolean;
    data: { id: string; title: string } | null;
  }> = {}
) => ({
  isPending: false,
  isError: false,
  error: Error('Unknown error'),
  data: null,
  refetch: vi.fn(),
  ...overrides,
});

const defaultProps = {
  releaseId: 'release-1',
  title: 'Midnight Serenade',
  artistName: 'John Doe',
  open: true,
  onOpenChange: vi.fn(),
  takeMediaEl: (): HTMLAudioElement | null => null,
};

describe('ReleasePlayDialog', () => {
  it('does not fetch while closed', () => {
    mockUseReleaseQuery.mockReturnValue(queryState({ isPending: true }));

    render(<ReleasePlayDialog {...defaultProps} open={false} />);

    expect(mockUseReleaseQuery).toHaveBeenCalledWith('release-1', { enabled: false });
    expect(screen.queryByTestId('release-player')).not.toBeInTheDocument();
  });

  it('fetches ahead of opening when prefetch is requested', () => {
    mockUseReleaseQuery.mockReturnValue(queryState({ isPending: true }));

    render(<ReleasePlayDialog {...defaultProps} open={false} prefetch />);

    expect(mockUseReleaseQuery).toHaveBeenCalledWith('release-1', { enabled: true });
  });

  it('shows a loading skeleton while the release is pending', () => {
    mockUseReleaseQuery.mockReturnValue(queryState({ isPending: true }));

    render(<ReleasePlayDialog {...defaultProps} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading release…');
    expect(screen.queryByTestId('release-player')).not.toBeInTheDocument();
  });

  it('shows an error state when the release fails to load', () => {
    mockUseReleaseQuery.mockReturnValue(queryState({ isError: true }));

    render(<ReleasePlayDialog {...defaultProps} />);

    expect(screen.getByRole('alert')).toHaveTextContent('This release can’t be played right now.');
  });

  it('shows the error state when the release does not exist', () => {
    mockUseReleaseQuery.mockReturnValue(queryState({ data: null }));

    render(<ReleasePlayDialog {...defaultProps} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('mounts the autoplaying player with the fetched release and primed element supplier', () => {
    mockUseReleaseQuery.mockReturnValue(
      queryState({ data: { id: 'release-1', title: 'Midnight Serenade' } })
    );

    render(<ReleasePlayDialog {...defaultProps} />);

    const player = screen.getByTestId('release-player');
    expect(player).toHaveAttribute('data-release', 'release-1');
    expect(player).toHaveAttribute('data-autoplay', 'true');
    expect(player).toHaveAttribute('data-release-id', 'release-1');
    expect(player).toHaveAttribute('data-release-title', 'Midnight Serenade');
    expect(player).toHaveAttribute('data-has-take-media-el', 'true');
  });

  it('titles the dialog with the release and artist', () => {
    mockUseReleaseQuery.mockReturnValue(queryState({ isPending: true }));

    render(<ReleasePlayDialog {...defaultProps} />);

    expect(screen.getByText('Midnight Serenade')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('keeps the dialog to a tasteful width and scrollable height', () => {
    mockUseReleaseQuery.mockReturnValue(queryState({ isPending: true }));

    render(<ReleasePlayDialog {...defaultProps} />);

    const content = screen.getByRole('dialog');
    expect(content).toHaveClass('sm:max-w-md', 'lg:max-w-lg', 'max-h-[90dvh]', 'overflow-y-auto');
  });
});

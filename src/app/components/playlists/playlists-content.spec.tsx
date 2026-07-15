/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { PlaylistsContent } from './playlists-content';

const mockReplace = vi.hoisted(() => vi.fn());
const mockSearchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams.current,
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

interface CreatorStubProps {
  editPlaylistId: string | null;
  onEditHandled: () => void;
}

vi.mock('./playlist-creator', () => ({
  PlaylistCreator: ({ editPlaylistId, onEditHandled }: CreatorStubProps) => (
    <div data-testid="playlist-creator" data-edit-playlist-id={editPlaylistId ?? 'null'}>
      <button type="button" onClick={onEditHandled}>
        stub-edit-handled
      </button>
    </div>
  ),
}));

interface ListStubProps {
  onEdit: (id: string) => void;
  onPlay: (id: string) => void;
  onShare: (id: string) => void;
  className?: string;
}

vi.mock('./playlist-list', () => ({
  PlaylistList: ({ onEdit, onPlay, onShare, className }: ListStubProps) => (
    <div data-testid="playlist-list" className={className}>
      <button type="button" onClick={() => onEdit('pl-1')}>
        stub-list-edit
      </button>
      <button type="button" onClick={() => onPlay('pl-1')}>
        stub-list-play
      </button>
      <button type="button" onClick={() => onShare('pl-1')}>
        stub-list-share
      </button>
    </div>
  ),
}));

interface SearchStubProps {
  onSelect: (id: string) => void;
  className?: string;
}

vi.mock('./my-playlist-search', () => ({
  MyPlaylistSearch: ({ onSelect, className }: SearchStubProps) => (
    <div data-testid="my-playlist-search" className={className}>
      <button type="button" onClick={() => onSelect('pl-7')}>
        stub-search-select
      </button>
    </div>
  ),
}));

interface ViewStubProps {
  playlistId: string;
  onBackToCreator: () => void;
  onEdit: (id: string) => void;
  onPlay: (id: string) => void;
}

vi.mock('./playlist-view', () => ({
  PlaylistView: ({ playlistId, onBackToCreator, onEdit, onPlay }: ViewStubProps) => (
    <div data-testid="playlist-view" data-playlist-id={playlistId}>
      <button type="button" onClick={onBackToCreator}>
        stub-view-back
      </button>
      <button type="button" onClick={() => onEdit(playlistId)}>
        stub-view-edit
      </button>
      <button type="button" onClick={() => onPlay(playlistId)}>
        stub-view-play
      </button>
    </div>
  ),
}));

/** Re-stub `matchMedia` (setupTests defaults it to non-matching) per test. */
const mockMatchMedia = (matches: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

const toastInfoMock = vi.mocked(toast.info);

const creatorWrapper = (): HTMLElement | null =>
  screen.getByTestId('playlist-creator').parentElement;

describe('PlaylistsContent', () => {
  beforeEach(() => {
    mockSearchParams.current = new URLSearchParams();
  });

  describe('edit deep link', () => {
    it('forwards a null edit request when the URL has no edit param', () => {
      render(<PlaylistsContent />);

      expect(screen.getByTestId('playlist-creator')).toHaveAttribute(
        'data-edit-playlist-id',
        'null'
      );
    });

    it('forwards the ?edit= param to the creator', () => {
      mockSearchParams.current = new URLSearchParams('edit=pl-9');
      render(<PlaylistsContent />);

      expect(screen.getByTestId('playlist-creator')).toHaveAttribute(
        'data-edit-playlist-id',
        'pl-9'
      );
    });

    it('clears the URL without scrolling once the creator acks the edit', async () => {
      const user = userEvent.setup();
      mockSearchParams.current = new URLSearchParams('edit=pl-9');
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-edit-handled' }));

      expect(mockReplace).toHaveBeenCalledExactlyOnceWith('/playlists', { scroll: false });
    });
  });

  describe('mobile view swap', () => {
    it('shows the creator without a view initially', () => {
      render(<PlaylistsContent />);

      expect(screen.queryByTestId('playlist-view')).not.toBeInTheDocument();
      expect(creatorWrapper()).not.toHaveClass('hidden');
    });

    it('shows the selected playlist view after a search selection', async () => {
      const user = userEvent.setup();
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-search-select' }));

      expect(screen.getByTestId('playlist-view')).toHaveAttribute('data-playlist-id', 'pl-7');
    });

    it('keeps the creator mounted inside a hidden wrapper while a view is open', async () => {
      const user = userEvent.setup();
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-search-select' }));

      expect(screen.getByTestId('playlist-creator')).toBeInTheDocument();
      expect(creatorWrapper()).toHaveClass('hidden');
    });

    it('returns to the creator when the view toggles back', async () => {
      const user = userEvent.setup();
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-search-select' }));
      await user.click(screen.getByRole('button', { name: 'stub-view-back' }));

      expect(screen.queryByTestId('playlist-view')).not.toBeInTheDocument();
      expect(creatorWrapper()).not.toHaveClass('hidden');
    });

    it('applies the mobile-only class to the search', () => {
      render(<PlaylistsContent />);

      expect(screen.getByTestId('my-playlist-search')).toHaveClass('lg:hidden');
    });

    it('applies the desktop scroll classes to the list pane', () => {
      render(<PlaylistsContent />);

      expect(screen.getByTestId('playlist-list')).toHaveClass(
        'mt-8',
        'lg:mt-0',
        'lg:max-h-[75vh]',
        'lg:overflow-y-auto'
      );
    });
  });

  describe('shared edit handler', () => {
    it('rewrites the URL with the edit param from a list row edit', async () => {
      const user = userEvent.setup();
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-list-edit' }));

      expect(mockReplace).toHaveBeenCalledExactlyOnceWith('/playlists?edit=pl-1', {
        scroll: false,
      });
    });

    it('clears an open view so the creator is visible again', async () => {
      const user = userEvent.setup();
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-search-select' }));
      await user.click(screen.getByRole('button', { name: 'stub-list-edit' }));

      expect(screen.queryByTestId('playlist-view')).not.toBeInTheDocument();
      expect(creatorWrapper()).not.toHaveClass('hidden');
    });

    it('routes the view edit button through the same handler', async () => {
      const user = userEvent.setup();
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-search-select' }));
      await user.click(screen.getByRole('button', { name: 'stub-view-edit' }));

      expect(mockReplace).toHaveBeenCalledExactlyOnceWith('/playlists?edit=pl-7', {
        scroll: false,
      });
      expect(screen.queryByTestId('playlist-view')).not.toBeInTheDocument();
    });

    it('scrolls the creator into view below the lg breakpoint', async () => {
      const user = userEvent.setup();
      mockMatchMedia(true);
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-list-edit' }));

      expect(vi.mocked(Element.prototype.scrollIntoView)).toHaveBeenCalledTimes(1);
    });

    it('does not scroll at or above the lg breakpoint', async () => {
      const user = userEvent.setup();
      mockMatchMedia(false);
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-list-edit' }));

      expect(vi.mocked(Element.prototype.scrollIntoView)).not.toHaveBeenCalled();
    });
  });

  describe('stubbed actions', () => {
    it('toasts the player stub copy from a list row play', async () => {
      const user = userEvent.setup();
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-list-play' }));

      expect(toastInfoMock).toHaveBeenCalledExactlyOnceWith(
        'Playlist player arrives in the next update'
      );
    });

    it('toasts the player stub copy from the view play button', async () => {
      const user = userEvent.setup();
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-search-select' }));
      await user.click(screen.getByRole('button', { name: 'stub-view-play' }));

      expect(toastInfoMock).toHaveBeenCalledExactlyOnceWith(
        'Playlist player arrives in the next update'
      );
    });

    it('toasts the sharing stub copy from a list row share', async () => {
      const user = userEvent.setup();
      render(<PlaylistsContent />);

      await user.click(screen.getByRole('button', { name: 'stub-list-share' }));

      expect(toastInfoMock).toHaveBeenCalledExactlyOnceWith('Sharing arrives in the next update');
    });
  });
});

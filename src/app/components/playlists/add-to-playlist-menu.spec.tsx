/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SessionStatus } from '@/app/hooks/use-session';
import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { AddToPlaylistMenu } from './add-to-playlist-menu';

const useSessionMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-session', () => ({ useSession: useSessionMock }));

// Stub DotNavMenu after the real Radix Popover: render the trigger always, but
// only mount the popover content (children) while `open` is true.
interface DotNavStubProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
  className?: string;
}
vi.mock('@/app/components/ui/audio/media-player', () => ({
  MediaPlayer: {
    DotNavMenu: ({ children, open, onOpenChange, label, className }: DotNavStubProps) => (
      <div>
        <button
          type="button"
          aria-label={label}
          className={className}
          onClick={() => onOpenChange?.(!open)}
        >
          menu
        </button>
        {open ? <div data-testid="popover-content">{children}</div> : null}
      </div>
    ),
  },
}));

// Panel stub: a button that fires onCreatePlaylist, so the parent's
// close-popover-then-open-dialog wiring can be driven.
interface PanelStubProps {
  onCreatePlaylist: () => void;
}
vi.mock('./add-to-playlist-panel', () => ({
  AddToPlaylistPanel: ({ onCreatePlaylist }: PanelStubProps) => (
    <div data-testid="panel-body">
      <button type="button" onClick={onCreatePlaylist}>
        create
      </button>
    </div>
  ),
}));

// Dialog stub: renders a role="dialog" only when open.
interface DialogStubProps {
  open: boolean;
}
vi.mock('./create-playlist-dialog', () => ({
  CreatePlaylistDialog: ({ open }: DialogStubProps) =>
    open ? <div role="dialog">create dialog</div> : null,
}));

const item: PlaylistSearchItem = {
  key: 'track:tf1:rel1',
  itemType: 'track',
  title: 'Test Song',
  artistName: 'Test Artist',
  coverArt: null,
  duration: 210,
  source: { trackFileId: 'tf1', releaseId: 'rel1' },
};

const mockStatus = (status: SessionStatus): void => {
  useSessionMock.mockReturnValue({ status });
};

describe('AddToPlaylistMenu', () => {
  it('renders nothing when unauthenticated', () => {
    mockStatus('unauthenticated');

    const { container } = render(<AddToPlaylistMenu item={item} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the session is loading', () => {
    mockStatus('loading');

    render(<AddToPlaylistMenu item={item} />);

    expect(screen.queryByRole('button', { name: 'Add to a playlist' })).not.toBeInTheDocument();
  });

  it('renders the kebab trigger when authenticated', () => {
    mockStatus('authenticated');

    render(<AddToPlaylistMenu item={item} />);

    expect(screen.getByRole('button', { name: 'Add to a playlist' })).toBeInTheDocument();
  });

  it('closes the popover and opens the create dialog on create', async () => {
    mockStatus('authenticated');
    const user = userEvent.setup();

    render(<AddToPlaylistMenu item={item} />);

    // Open the popover so the panel mounts.
    await user.click(screen.getByRole('button', { name: 'Add to a playlist' }));
    expect(screen.getByTestId('panel-body')).toBeInTheDocument();

    // Fire the panel's create shortcut.
    await user.click(screen.getByRole('button', { name: 'create' }));

    // End state: popover content unmounted, create dialog present.
    expect(screen.queryByTestId('panel-body')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

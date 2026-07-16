/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { CreatePlaylistDialog } from './create-playlist-dialog';

const pushMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

// Stub the creator: expose the props under assertion and a button that fires
// the passed onOpenInMyPlaylists so the dialog's wiring can be driven.
const seedItemSpy = vi.hoisted(() => vi.fn());
vi.mock('./playlist-creator', () => ({
  PlaylistCreator: ({
    variant,
    seedItem,
    onOpenInMyPlaylists,
  }: {
    variant?: string;
    seedItem?: PlaylistSearchItem;
    onOpenInMyPlaylists?: (playlistId: string) => void;
  }) => {
    seedItemSpy(seedItem);
    return (
      <div data-testid="playlist-creator" data-variant={variant}>
        <button type="button" onClick={() => onOpenInMyPlaylists?.('p9')}>
          fire open-in-my-playlists
        </button>
      </div>
    );
  },
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

describe('CreatePlaylistDialog', () => {
  it('embeds the creator in embedded variant seeded with the item when open', () => {
    render(<CreatePlaylistDialog open onOpenChange={vi.fn()} item={item} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('playlist-creator')).toHaveAttribute('data-variant', 'embedded');
    expect(seedItemSpy).toHaveBeenCalledWith(item);
  });

  it('routes to the edit deep-link and closes on open-in-my-playlists', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CreatePlaylistDialog open onOpenChange={onOpenChange} item={item} />);

    await user.click(screen.getByRole('button', { name: 'fire open-in-my-playlists' }));

    expect(pushMock).toHaveBeenCalledWith('/playlists?edit=p9');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

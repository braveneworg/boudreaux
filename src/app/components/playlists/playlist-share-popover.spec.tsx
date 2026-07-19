/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { PlaylistSharePopover } from './playlist-share-popover';

const updatePlaylistMock = vi.hoisted(() => vi.fn());
const isUpdatingPlaylistMock = vi.hoisted(() => ({ value: false }));

vi.mock('./_hooks/mutations/use-playlist-mutations', () => ({
  useUpdatePlaylistMutation: () => ({
    updatePlaylist: updatePlaylistMock,
    isUpdatingPlaylist: isUpdatingPlaylistMock.value,
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The widget is lazy-loaded through next/dynamic; mocking the module makes the
// dynamic import resolve to this stub, which surfaces the url prop for asserts.
vi.mock('@/components/social-share-widget', () => ({
  SocialShareWidget: ({ url }: { url: string }) => <div data-testid="share-widget">{url}</div>,
}));

const renderOpen = async (isPublic: boolean): Promise<void> => {
  const user = userEvent.setup();
  render(
    <PlaylistSharePopover playlistId="pl-1" playlistTitle="Road Trip" isPublic={isPublic}>
      <button type="button">Share playlist</button>
    </PlaylistSharePopover>
  );
  await user.click(screen.getByRole('button', { name: 'Share playlist' }));
};

describe('PlaylistSharePopover', () => {
  it('embeds the share widget with the /playlists/{id} url when public', async () => {
    await renderOpen(true);

    expect(await screen.findByTestId('share-widget')).toHaveTextContent(
      'http://localhost:3000/playlists/pl-1'
    );
  });

  it('shows the private hint and no widget when private', async () => {
    await renderOpen(false);

    expect(
      screen.getByText('Only you can see this playlist — make it public to share.')
    ).toBeVisible();
    expect(screen.queryByTestId('share-widget')).not.toBeInTheDocument();
  });

  it('fires the make-public mutation and toasts on success', async () => {
    const user = userEvent.setup();
    await renderOpen(false);

    await user.click(screen.getByRole('button', { name: 'Make public' }));

    expect(updatePlaylistMock).toHaveBeenCalledExactlyOnceWith(
      { playlistId: 'pl-1', isPublic: true },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
    const [, callbacks] = updatePlaylistMock.mock.calls[0];
    callbacks.onSuccess();
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('"Road Trip" is now public');
    callbacks.onError(new Error('nope'));
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('nope');
  });

  it('disables the make-public button while the mutation is in flight', async () => {
    isUpdatingPlaylistMock.value = true;
    await renderOpen(false);

    expect(screen.getByRole('button', { name: 'Making public…' })).toBeDisabled();
    isUpdatingPlaylistMock.value = false;
  });
});

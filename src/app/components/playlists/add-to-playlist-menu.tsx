/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { type ReactElement, useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import { MediaPlayer } from '@/app/components/ui/audio/media-player';
import { useSession } from '@/hooks/use-session';
import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';
import { cn } from '@/lib/utils';

// Lazy-load the heavy children behind the interaction — they only mount once the
// popover opens or the create shortcut fires, so nothing needs to be in the
// server HTML and the App-Router "dynamic SSRs only the fallback" caveat is moot.
const AddToPlaylistPanel = dynamic(() =>
  import('./add-to-playlist-panel').then((m) => m.AddToPlaylistPanel)
);
const CreatePlaylistDialog = dynamic(() =>
  import('./create-playlist-dialog').then((m) => m.CreatePlaylistDialog)
);

interface AddToPlaylistMenuProps {
  /** The single fixed item every add through this menu targets. */
  item: PlaylistSearchItem;
  /** Positioning classes for the trigger (e.g. absolute top-right). */
  className?: string;
}

/**
 * Session-gated kebab for the player surfaces: renders {@link MediaPlayer.DotNavMenu}
 * (a Radix Popover) holding the lazy {@link AddToPlaylistPanel}, and owns the
 * popover / create-dialog state. Mount-gated so it renders NOTHING on the server
 * and the client's first paint — `useSession` resolves to `authenticated` during
 * SSR (the cookie is present) yet starts `loading` on the client, so rendering the
 * Popover server-side and null client-side hydrates as a mismatch and React
 * regenerates the subtree (janking the portaled popover on busy pages like
 * /videos). Deferring all output to after mount keeps hydration stable (the same
 * pattern as DesktopAuthMenu / use-nav-menu-items). Hidden for signed-out users.
 * Creating a new playlist closes the popover *before* opening the dialog to avoid
 * a Radix focus-teardown race.
 */
export const AddToPlaylistMenu = ({
  item,
  className,
}: AddToPlaylistMenuProps): ReactElement | null => {
  const { status } = useSession();
  const [mounted, setMounted] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || status !== 'authenticated') return null;

  const handleCreate = (): void => {
    setPopoverOpen(false);
    setDialogOpen(true);
  };

  return (
    <>
      <MediaPlayer.DotNavMenu
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        label="Add to a playlist"
        className={cn('text-zinc-600 hover:text-zinc-900', className)}
      >
        <AddToPlaylistPanel
          item={item}
          onCreatePlaylist={handleCreate}
          onAdded={() => setPopoverOpen(false)}
        />
      </MediaPlayer.DotNavMenu>
      {dialogOpen && (
        <CreatePlaylistDialog open={dialogOpen} onOpenChange={setDialogOpen} item={item} />
      )}
    </>
  );
};

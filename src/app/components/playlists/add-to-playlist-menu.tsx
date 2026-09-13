/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { type ReactElement, useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import { MediaPlayer } from '@/app/components/ui/audio/media-player';
import { Skeleton } from '@/app/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';
import { cn } from '@/lib/utils';

/**
 * Footprint-preserving fallback rendered inside the open popover while the
 * panel chunk loads: the real heading, an input-height block, the picker's
 * empty-state height, and a button-height block — so the popover measures the
 * same size before and after the panel lands and doesn't jump.
 */
const AddToPlaylistPanelFallback = (): ReactElement => (
  <div className="flex w-full flex-col gap-2" aria-busy="true">
    <p className="px-2 text-sm font-semibold">Add to a playlist</p>
    <Skeleton className="my-0 h-9 w-full" />
    <p className="py-6 text-center text-sm">Loading…</p>
    <Skeleton className="my-0 h-10 w-full" />
  </div>
);

// Lazy-load the heavy children behind the interaction — they only mount once the
// popover opens or the create shortcut fires, so nothing needs to be in the
// server HTML and the App-Router "dynamic SSRs only the fallback" caveat is moot.
//
// `ssr: false` is load-bearing, not just accurate: the App Router's `dynamic()`
// wraps the lazy component in its OWN Suspense boundary only when `ssr: false`
// or a `loading` component is given. Without one, the first open's chunk load
// suspends up to the nearest ancestor boundary — the route's `loading.tsx` —
// and React hides the entire page (and disposes the audio player) until the
// chunk arrives. See docs/lessons/react-nextjs/next-dynamic-needs-own-boundary.md.
const AddToPlaylistPanel = dynamic(
  () => import('./add-to-playlist-panel').then((m) => m.AddToPlaylistPanel),
  { ssr: false, loading: AddToPlaylistPanelFallback }
);
const CreatePlaylistDialog = dynamic(
  () => import('./create-playlist-dialog').then((m) => m.CreatePlaylistDialog),
  // The dialog opens once its chunk lands; nothing needs to hold space for it.
  { ssr: false, loading: () => null }
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

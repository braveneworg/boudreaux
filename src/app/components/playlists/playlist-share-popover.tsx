/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement, ReactNode } from 'react';

import nextDynamic from 'next/dynamic';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUpdatePlaylistMutation } from '@/hooks/mutations/use-playlist-mutations';

const SocialShareWidget = nextDynamic(
  () =>
    import('@/components/social-share-widget').then((mod) => ({
      default: mod.SocialShareWidget,
    })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-8 min-h-8 w-36 animate-pulse" />,
  }
);

interface PlaylistSharePopoverProps {
  /** The playlist the share URL points at. */
  playlistId: string;
  /** Names the success toast when the playlist is made public. */
  playlistTitle: string;
  /** Public playlists show the share widget; private ones the make-public hint. */
  isPublic: boolean;
  /** The trigger element, rendered via `PopoverTrigger asChild` (must take a ref). */
  children: ReactNode;
}

/** Exact private-playlist hint copy (asserted verbatim in unit + E2E specs). */
const PRIVATE_HINT = 'Only you can see this playlist — make it public to share.';

/**
 * SSR-safe origin: rows render this component on the server where
 * `globalThis.location` is undefined; the popover content (the only consumer)
 * mounts client-side only, so the empty fallback never reaches the DOM.
 */
const clientOrigin = (): string => globalThis.location?.origin ?? '';

/**
 * Share popover for a playlist: public playlists embed the lazy
 * `SocialShareWidget` pointed at `{origin}/playlists/{id}`; private ones show
 * a hint plus an inline "Make public" button that runs the update mutation —
 * the resulting `playlists.mine()` invalidation flips `isPublic` upstream and
 * the widget swaps in live while the popover stays open.
 */
export const PlaylistSharePopover = ({
  playlistId,
  playlistTitle,
  isPublic,
  children,
}: PlaylistSharePopoverProps): ReactElement => {
  const { updatePlaylist, isUpdatingPlaylist } = useUpdatePlaylistMutation();
  const shareUrl = `${clientOrigin()}/playlists/${playlistId}`;

  const handleMakePublic = (): void =>
    updatePlaylist(
      { playlistId, isPublic: true },
      {
        onSuccess: () => toast.success(`"${playlistTitle}" is now public`),
        onError: (error: Error) => toast.error(error.message),
      }
    );

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent aria-label="Share playlist" className="flex w-80 flex-col gap-3">
        {isPublic ? (
          <div className="flex items-center justify-center gap-1 overflow-hidden">
            <SocialShareWidget url={shareUrl} />
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-500">{PRIVATE_HINT}</p>
            <Button type="button" onClick={handleMakePublic} disabled={isUpdatingPlaylist}>
              {isUpdatingPlaylist ? 'Making public…' : 'Make public'}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

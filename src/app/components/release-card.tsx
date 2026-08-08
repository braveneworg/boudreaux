/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

/**
 * ReleaseCard component for the public releases listing rows.
 * Displays a release's cover art (click to enlarge with details), artist name,
 * title, Bandcamp link (if available), a Download trigger, and a "Play" button
 * that source-primes the first MP3 track inside the click gesture and opens
 * the {@link ReleasePlayDialog} listening-station modal.
 */
import { useState } from 'react';

import Link from 'next/link';

import { Music2 } from 'lucide-react';

import { usePrimedAudioHandoff } from '@/hooks/use-primed-audio-handoff';
import { cn } from '@/lib/utils';

import { DeferredDownloadDialog } from './deferred-download-dialog';
import { ReleaseCoverModal } from './release-cover-modal';
import { ReleasePlayDialog } from './release-play-dialog';

interface ReleaseCardProps {
  /** Unique release identifier */
  id: string;
  /** Release title */
  title: string;
  /** Resolved artist display name, or null if unresolvable */
  artistName: string | null;
  /** Cover art source and alt text, or null for styled placeholder */
  coverArt: { src: string; alt: string } | null;
  /** Release date, shown in the cover preview dialog */
  releasedOn: Date;
  /** Bandcamp URL for external purchase link, or null */
  bandcampUrl: string | null;
  /** Playable URL of the release's first MP3 track, or null when none exists */
  playSrc: string | null;
}

/**
 * A card displaying a single release with cover art, artist name, title, and
 * actions (Play, Download, Bandcamp). Play starts real playback of the first
 * track inside the click gesture (so strict autoplay policies stay satisfied)
 * and opens the modal player, which adopts the already-playing element. On
 * desktop the whole card scales up slightly on hover.
 */
export const ReleaseCard = ({
  id,
  title,
  artistName,
  coverArt,
  releasedOn,
  bandcampUrl,
  playSrc,
}: ReleaseCardProps) => {
  const [playerOpen, setPlayerOpen] = useState(false);
  const [prefetchPlayer, setPrefetchPlayer] = useState(false);
  const { primeMediaEl, takeMediaEl, discardMediaEl } = usePrimedAudioHandoff();

  const openPlayer = (): void => {
    if (!playSrc) return;
    // Start playback of the real first track inside the click gesture —
    // allowed by every autoplay policy, unlike the modal player's deferred
    // play(), which strict profiles and extensions can reject.
    primeMediaEl(playSrc);
    setPlayerOpen(true);
  };

  const handlePlayerOpenChange = (open: boolean): void => {
    if (!open) {
      // Closed before the player adopted the element — stop it, or the
      // gesture-started audio keeps playing with no UI attached.
      discardMediaEl();
    }
    setPlayerOpen(open);
  };

  /** Pre-warm the modal's release-detail fetch on hover/focus intent. */
  const warmPlayer = (): void => setPrefetchPlayer(true);

  return (
    <div className="shadow-zine-sm relative flex flex-col gap-2 border-2 border-black bg-white p-3 transition-transform duration-200 md:hover:z-10 md:hover:scale-[1.03]">
      {/* Cover Art — click to enlarge with release info + detail link */}
      <ReleaseCoverModal
        id={id}
        title={title}
        artistName={artistName}
        coverArt={coverArt}
        releasedOn={releasedOn}
      />

      {/* Info */}
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {artistName && <p className="text-xs text-zinc-500">{artistName}</p>}
      </div>

      {/* Actions — wraps inside the narrow row column */}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={`Play ${title}`}
          disabled={!playSrc}
          onClick={openPlayer}
          onPointerEnter={warmPlayer}
          onFocus={warmPlayer}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1 border-2 border-black px-3 py-1.5 text-xs font-medium',
            'shadow-zine-ink transition-colors hover:bg-zinc-950 hover:text-zinc-50',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <Music2 className="size-3.5" />
          Play
        </button>

        <DeferredDownloadDialog
          artistName={artistName ?? ''}
          releaseId={id}
          releaseTitle={title}
          triggerClassName={cn(
            'mb-0 min-h-0 gap-1 border-2 border-black shadow-zine-ink px-3 py-1.5 text-xs font-medium opacity-100',
            'hover:bg-zinc-950 hover:text-zinc-50 hover:opacity-100 transition-colors'
          )}
        />

        {bandcampUrl ? (
          <Link
            href={bandcampUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shadow-zine-ink inline-flex items-center border-2 border-black bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-900"
          >
            Bandcamp
          </Link>
        ) : null}
      </div>

      {playSrc ? (
        <ReleasePlayDialog
          releaseId={id}
          title={title}
          artistName={artistName}
          open={playerOpen}
          onOpenChange={handlePlayerOpenChange}
          takeMediaEl={takeMediaEl}
          prefetch={prefetchPlayer}
        />
      ) : null}
    </div>
  );
};

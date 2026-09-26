/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useId, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { RemovablePill } from '@/app/components/ui/removable-pill';
import { queryKeys } from '@/lib/query-keys';
import { isHttpUrl } from '@/lib/utils/is-http-url';
import type { ImageSourceLink } from '@/lib/validation/image-links-schema';
import {
  CLIENT_POLL_DEADLINE_MS,
  isInFlightJobStatus,
  STALE_JOB_TIMEOUT_MESSAGE,
} from '@/utils/async-job-lifecycle';

import {
  useAddImageSourceLinkMutation,
  useGenerateImagesFromLinksMutation,
  useRemoveImageSourceLinkMutation,
} from './_hooks/mutations/use-image-source-link-mutations';
import { useArtistImageLinksQuery } from './_hooks/use-artist-image-links-query';

export interface ImageSourceLinksSectionProps {
  /** The artist whose image sources are edited. */
  artistId: string;
  /** Disables every control (parent form busy). */
  disabled?: boolean;
}

/** Toast copy for a finished run. */
const addedCopy = (count: number | null): string => {
  if (!count) return 'No new images found on those pages.';
  return count === 1 ? 'Added 1 image to the pool.' : `Added ${count} images to the pool.`;
};

interface ImageLinksJob {
  /** The artist's stored image-source links. */
  links: ImageSourceLink[];
  /** True from trigger until the terminal outcome has been surfaced. */
  busy: boolean;
  /** Triggers the job; a rejected trigger toasts and leaves the section idle. */
  generate: () => Promise<void>;
}

/**
 * Owns the images-from-links job lifecycle for the section: polls the status
 * query, tracks a run from trigger (or from observing one in flight after a
 * reload) to its terminal state, toasts the outcome once, refreshes the pool
 * queries on success, and gives up with the shared timeout copy if the job
 * never resolves client-side.
 */
const useImageLinksJob = (artistId: string): ImageLinksJob => {
  const queryClient = useQueryClient();
  // True from trigger (or observing an in-flight job) until the terminal
  // status has been surfaced, so a stale `succeeded` never toasts on mount.
  const [active, setActive] = useState(false);
  const status = useArtistImageLinksQuery(artistId);
  const { generateImagesFromLinksAsync, isTriggeringImagesFromLinks } =
    useGenerateImagesFromLinksMutation(artistId);

  const jobStatus = status.data?.status ?? null;
  const inFlight = isInFlightJobStatus(jobStatus);

  useEffect(() => {
    if (inFlight) setActive(true);
  }, [inFlight]);

  useEffect(() => {
    if (!active || inFlight || !status.data) return;
    if (jobStatus === 'succeeded') {
      toast.success(addedCopy(status.data.addedCount));
      void queryClient.invalidateQueries({ queryKey: queryKeys.artists.bioGeneration(artistId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.artists.bioImages(artistId) });
      setActive(false);
    } else if (jobStatus === 'failed') {
      toast.error(status.data.error || 'Image generation failed.');
      setActive(false);
    }
  }, [active, inFlight, jobStatus, status.data, artistId, queryClient]);

  useEffect(() => {
    if (!active) return;
    const timeoutId = setTimeout(() => {
      toast.error(STALE_JOB_TIMEOUT_MESSAGE);
      setActive(false);
    }, CLIENT_POLL_DEADLINE_MS);
    return () => clearTimeout(timeoutId);
  }, [active]);

  const generate = async (): Promise<void> => {
    const response = await generateImagesFromLinksAsync();
    if (!response.success) {
      toast.error(response.error);
      return;
    }
    setActive(true);
  };

  return { links: status.data?.links ?? [], busy: active || isTriggeringImagesFromLinks, generate };
};

interface ImageSourcePillsProps {
  links: ImageSourceLink[];
  disabled: boolean;
  onRemove: (linkId: string) => void;
}

/** The stored links as removable pills; renders nothing when there are none. */
const ImageSourcePills = ({
  links,
  disabled,
  onRemove,
}: ImageSourcePillsProps): React.ReactElement | null => {
  if (links.length === 0) return null;
  return (
    <ul aria-label="Image source links" className="flex flex-wrap gap-1.5">
      {links.map((link) => (
        <li key={link.id} className="min-w-0">
          <RemovablePill
            label={link.url}
            title={link.url}
            className="max-w-full [&>span]:truncate"
            onRemove={() => onRemove(link.id)}
            disabled={disabled}
          />
        </li>
      ))}
    </ul>
  );
};

interface GenerateImagesButtonProps {
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}

/** The trigger button plus its in-flight status line. */
const GenerateImagesButton = ({
  busy,
  disabled,
  onClick,
}: GenerateImagesButtonProps): React.ReactElement => (
  <div className="flex items-center gap-2">
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <ImagePlus className="size-4" aria-hidden />
      )}
      {busy ? 'Generating images…' : 'Generate images'}
    </Button>
    {busy && (
      <p role="status" className="text-muted-foreground text-xs">
        Reading links for photos — the pool refreshes when done.
      </p>
    )}
  </div>
);

/**
 * The image-sources editor rendered below the image pool: a URL input with a
 * plus button to store page links, a removable pill per stored link, and a
 * "Generate images" button that starts the images-from-links job. While the
 * job runs the section polls its status; on completion it toasts the number of
 * images added and refreshes the pool.
 */
export const ImageSourceLinksSection = ({
  artistId,
  disabled = false,
}: ImageSourceLinksSectionProps): React.ReactElement => {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const { links, busy, generate } = useImageLinksJob(artistId);
  const { addImageSourceLink, isAddingImageSourceLink } = useAddImageSourceLinkMutation(artistId);
  const { removeImageSourceLink, isRemovingImageSourceLink } =
    useRemoveImageSourceLinkMutation(artistId);

  const locked = disabled || busy || isAddingImageSourceLink || isRemovingImageSourceLink;
  const trimmedDraft = draft.trim();

  const addLink = (): void => {
    if (!trimmedDraft) return;
    if (!isHttpUrl(trimmedDraft)) {
      toast.error('Links must start with http:// or https://');
      return;
    }
    addImageSourceLink(trimmedDraft);
    setDraft('');
  };

  return (
    <section aria-label="Image sources" className="space-y-2">
      <h3 className="text-sm font-semibold">Image sources</h3>
      <p className="text-muted-foreground text-xs">
        Add pages to pull photos from — a press kit, a gallery, or a direct image link. These links
        are not used for bios and are not shown on the site.
      </p>

      <Label htmlFor={inputId} className="sr-only">
        Image source link
      </Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="url"
          inputMode="url"
          placeholder="https://example.com/press"
          value={draft}
          disabled={disabled || busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addLink();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={addLink}
          disabled={locked || !trimmedDraft}
        >
          <Plus className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Add</span>
        </Button>
      </div>

      <ImageSourcePills links={links} disabled={locked} onRemove={removeImageSourceLink} />

      <GenerateImagesButton
        busy={busy}
        disabled={locked || links.length === 0}
        onClick={() => void generate()}
      />
    </section>
  );
};

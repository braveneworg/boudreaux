/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useId, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';

import Image from 'next/image';

import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MAX_PLAYLIST_COVER_IMAGES } from '@/lib/constants/playlists';
import { cn } from '@/lib/utils';

import { PlaylistCoverTiles } from './playlist-cover-tiles';
import {
  PLAYLIST_COVER_ACCEPTED_IMAGE_TYPES,
  usePlaylistCoverUpload,
  validatePlaylistCoverFiles,
} from './use-playlist-cover-upload';

const COVER_CAP_MESSAGE = `You can use at most ${MAX_PLAYLIST_COVER_IMAGES} cover images.`;

interface PlaylistCoverArtFieldProps {
  /** Persisted cover-image URLs (CDN URLs and/or selected artist images). */
  value: string[];
  onChange: (value: string[]) => void;
  /** `null` in create mode (no id yet — files stay pending until save). */
  playlistId: string | null;
  /** Deduped artist image URLs offered on the "From artists" tab. */
  availableArtistImages: string[];
  /** Files selected in create mode, uploaded by the caller after save. */
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
}

interface CoverThumbProps {
  /** Thumb source — a CDN URL or an object URL for a pending file. */
  src: string;
  /** Human label — feeds the image alt and the remove button's aria-label. */
  label: string;
  /** Disables the remove button (e.g. while an upload is in flight). */
  disabled: boolean;
  onRemove: () => void;
}

/** One object-URL preview for a file staged in create mode. */
interface PendingPreview {
  file: File;
  url: string;
}

const CoverThumb = ({ src, label, disabled, onRemove }: CoverThumbProps): ReactElement => (
  <li className="relative size-16 overflow-hidden border-2 border-black">
    <Image src={src} alt={label} fill sizes="64px" className="object-cover" />
    <button
      type="button"
      onClick={onRemove}
      disabled={disabled}
      aria-label={`Remove ${label}`}
      className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center bg-black/70 text-white hover:bg-black disabled:pointer-events-none disabled:opacity-50"
    >
      <X aria-hidden="true" className="size-3" />
    </button>
  </li>
);

/**
 * Cover-art picker for the playlist save dialog. Two-mode semantics:
 *
 * - Create mode (`playlistId === null`): a draft playlist has no id yet, so
 *   uploads are impossible — selected files land in the parent-owned
 *   `pendingFiles` (previewed via object URLs, revoked on cleanup) and the
 *   caller uploads them after the playlist is created.
 * - Edit mode (`playlistId` set): files upload immediately through
 *   {@link usePlaylistCoverUpload} and the returned CDN URLs append to `value`.
 *
 * The combined cap of {@link MAX_PLAYLIST_COVER_IMAGES} spans
 * `value + pendingFiles`; excess selections toast and are ignored.
 *
 * While an upload is in flight every mutating control (file input, remove
 * buttons, artist toggles) is disabled, so the `value` captured when the
 * upload started cannot be clobbered by a concurrent edit when it resolves.
 */
export const PlaylistCoverArtField = ({
  value,
  onChange,
  playlistId,
  availableArtistImages,
  pendingFiles,
  onPendingFilesChange,
}: PlaylistCoverArtFieldProps): ReactElement => {
  const inputId = useId();
  const { uploadFiles, isUploading, error } = usePlaylistCoverUpload();
  const [pendingPreviews, setPendingPreviews] = useState<PendingPreview[]>([]);

  useEffect(() => {
    const entries = pendingFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPendingPreviews(entries);
    return () => {
      for (const { url } of entries) URL.revokeObjectURL(url);
    };
  }, [pendingFiles]);

  const remainingSlots = MAX_PLAYLIST_COVER_IMAGES - value.length - pendingFiles.length;

  /** Slice a selection to the free slots, toasting when files were dropped. */
  const takeWithinCap = (files: File[]): File[] => {
    if (files.length > remainingSlots) toast.error(COVER_CAP_MESSAGE);
    return files.slice(0, Math.max(0, remainingSlots));
  };

  /** Create mode: pre-validate, then stage files for the post-save upload. */
  const addPendingFiles = (files: File[]): void => {
    const validationError = validatePlaylistCoverFiles(files);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    onPendingFilesChange([...pendingFiles, ...files]);
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    const files = takeWithinCap(selected);
    if (files.length === 0) return;
    if (playlistId === null) {
      addPendingFiles(files);
      return;
    }
    const publicUrls = await uploadFiles(playlistId, files);
    if (publicUrls.length > 0) onChange([...value, ...publicUrls]);
  };

  const toggleArtistImage = (url: string): void => {
    if (value.includes(url)) {
      onChange(value.filter((existing) => existing !== url));
      return;
    }
    if (remainingSlots <= 0) {
      toast.error(COVER_CAP_MESSAGE);
      return;
    }
    onChange([...value, url]);
  };

  const removeUploadedAt = (index: number): void =>
    onChange(value.filter((_, position) => position !== index));

  const removePendingFile = (file: File): void =>
    onPendingFilesChange(pendingFiles.filter((pending) => pending !== file));

  return (
    <div className="flex flex-col gap-3">
      <PlaylistCoverTiles
        images={[...value, ...pendingPreviews.map(({ url }) => url)]}
        size="lg"
        alt="Cover preview"
      />
      <Tabs defaultValue="upload">
        <TabsList className="w-full">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="artists">From artists</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-sm font-medium">
              Upload images
            </label>
            <Input
              id={inputId}
              type="file"
              multiple
              accept={PLAYLIST_COVER_ACCEPTED_IMAGE_TYPES.join(',')}
              disabled={isUploading}
              onChange={handleFileInputChange}
            />
          </div>
          {isUploading && (
            <p role="status" className="flex items-center gap-2 text-sm text-zinc-600">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Uploading…
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          {(value.length > 0 || pendingPreviews.length > 0) && (
            <ul className="flex flex-wrap gap-2">
              {value.map((url, index) => (
                <CoverThumb
                  key={url}
                  src={url}
                  label={`cover image ${index + 1}`}
                  disabled={isUploading}
                  onRemove={() => removeUploadedAt(index)}
                />
              ))}
              {pendingPreviews.map(({ file, url }) => (
                <CoverThumb
                  key={url}
                  src={url}
                  label={file.name}
                  disabled={isUploading}
                  onRemove={() => removePendingFile(file)}
                />
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="artists">
          {availableArtistImages.length === 0 ? (
            <p className="text-sm text-zinc-600">No artist images available.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {availableArtistImages.map((url, index) => {
                const isSelected = value.includes(url);
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => toggleArtistImage(url)}
                    disabled={isUploading}
                    aria-pressed={isSelected}
                    aria-label={`Artist image ${index + 1}`}
                    className={cn(
                      'relative aspect-square overflow-hidden border-2 border-black disabled:pointer-events-none disabled:opacity-50',
                      isSelected
                        ? 'ring-2 ring-black ring-offset-2'
                        : 'opacity-80 hover:opacity-100'
                    )}
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 25vw, 128px"
                      className="object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

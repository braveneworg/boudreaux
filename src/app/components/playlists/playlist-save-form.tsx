/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { PlaylistDetailResponse, PlaylistItemSourceRef } from '@/lib/types/domain/playlist';
import { coverImagesSchema, playlistTitleSchema } from '@/lib/validation/playlist-schema';

import { PlaylistCoverArtField } from './playlist-cover-art-field';
import { usePlaylistSaveSubmit } from './use-playlist-save-submit';

import type { PlaylistSaveFormValues } from './use-playlist-save-submit';

/**
 * Save-form schema, composed from the shared playlist validation primitives so
 * client rules never drift from the server action's input schema.
 */
const playlistSaveFormSchema = z.object({
  title: playlistTitleSchema,
  isPublic: z.boolean(),
  coverImages: coverImagesSchema,
});

interface PlaylistSaveFormProps {
  /** `dialog` renders the full DialogFooter; `inline` renders a bare Save row. */
  variant: 'dialog' | 'inline';
  mode: 'create' | 'edit';
  /** `null` in create mode until saved. */
  playlistId: string | null;
  /** Read once at mount — remount (e.g. via `key`) to load different values. */
  initialValues: { title: string; isPublic: boolean; coverImages: string[] };
  /** Create mode: sent as `createPlaylistAction` items. */
  pendingItemRefs: PlaylistItemSourceRef[];
  /** Deduped artist image URLs offered by the cover art field. */
  availableArtistImages: string[];
  onSaved: (playlist: PlaylistDetailResponse) => void;
  /** Lets a parent dialog gate its close while a save is in flight. */
  onSavingChange?: (isSaving: boolean) => void;
  /** Dialog only: closes the dialog. Also invoked by the submit hook on success. */
  onCancel?: () => void;
  /** Dialog + edit mode only: renders the footer-left "Add songs" button. */
  onAddSongs?: () => void;
}

/**
 * Create/edit form for a playlist's title, cover art, and visibility.
 *
 * RHF + Zod over `{ title, isPublic, coverImages }`; owns the `pendingFiles`
 * staged by the cover art field in create mode and hands them to
 * {@link usePlaylistSaveSubmit}, which runs the create → upload → update chain
 * and the cache bookkeeping. Server-side title errors (duplicate title) land
 * inline on the title field.
 *
 * Renders either inside a Dialog (`variant="dialog"`, full footer with Add
 * songs + Cancel + Save) or standalone (`variant="inline"`, Save-only footer).
 * `onSavingChange` mirrors the in-flight state so a parent dialog can keep
 * gating Escape/overlay close; the submit hook closes a dialog on success via
 * `onCancel`, which the dialog wires to its own `onOpenChange(false)`.
 */
export const PlaylistSaveForm = ({
  variant,
  mode,
  playlistId,
  initialValues,
  pendingItemRefs,
  availableArtistImages,
  onSaved,
  onSavingChange,
  onCancel,
  onAddSongs,
}: PlaylistSaveFormProps): ReactElement => {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const form = useForm<PlaylistSaveFormValues>({
    resolver: zodResolver(playlistSaveFormSchema),
    defaultValues: initialValues,
  });
  const { isSaving, submitSave } = usePlaylistSaveSubmit({
    mode,
    playlistId,
    pendingItemRefs,
    onTitleError: (message) => form.setError('title', { type: 'server', message }),
    onSaved,
    // The submit hook only ever requests a close (`false`) on success; route it
    // to the dialog's own close. Inline mode has no dialog, so this is a no-op.
    onOpenChange: () => onCancel?.(),
  });

  const isEditMode = mode === 'edit';

  // Mirror the in-flight state so a parent dialog can gate Escape/overlay close.
  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);

  const handleAddSongs = (): void => {
    onCancel?.();
    onAddSongs?.();
  };

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => submitSave(values, pendingFiles))}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="My playlist" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="coverImages"
          render={({ field }) => (
            <FormItem>
              <span className="text-sm font-medium">Cover art</span>
              <PlaylistCoverArtField
                value={field.value}
                onChange={field.onChange}
                playlistId={playlistId}
                availableArtistImages={availableArtistImages}
                pendingFiles={pendingFiles}
                onPendingFilesChange={setPendingFiles}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isPublic"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between">
              <FormLabel>Public playlist</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        {variant === 'dialog' ? (
          <DialogFooter>
            {isEditMode && onAddSongs && (
              <Button
                type="button"
                variant="outline"
                onClick={handleAddSongs}
                disabled={isSaving}
                className="sm:mr-auto"
              >
                Add songs
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
};

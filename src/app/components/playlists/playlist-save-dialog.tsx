/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
 * Dialog form schema, composed from the shared playlist validation primitives
 * so client rules never drift from the server action's input schema.
 */
const playlistSaveFormSchema = z.object({
  title: playlistTitleSchema,
  isPublic: z.boolean(),
  coverImages: coverImagesSchema,
});

interface PlaylistSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  /** Edit mode only: renders the footer-left "Add songs" button. */
  onAddSongs?: () => void;
}

/**
 * Create/edit dialog for a playlist's title, cover art, and visibility.
 *
 * RHF + Zod over `{ title, isPublic, coverImages }`; the dialog owns the
 * `pendingFiles` staged by the cover art field in create mode and hands them
 * to {@link usePlaylistSaveSubmit}, which runs the create → upload → update
 * chain and the cache bookkeeping. Server-side title errors (duplicate title)
 * land inline on the title field; "Add songs" closes the dialog first, then
 * notifies the caller.
 */
export const PlaylistSaveDialog = ({
  open,
  onOpenChange,
  mode,
  playlistId,
  initialValues,
  pendingItemRefs,
  availableArtistImages,
  onSaved,
  onAddSongs,
}: PlaylistSaveDialogProps): ReactElement => {
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
    onOpenChange,
  });

  const isEditMode = mode === 'edit';

  const handleAddSongs = (): void => {
    onOpenChange(false);
    onAddSongs?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit playlist' : 'New playlist'}</DialogTitle>
          <DialogDescription>
            Name your playlist, pick cover art, and choose who can see it.
          </DialogDescription>
        </DialogHeader>
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
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

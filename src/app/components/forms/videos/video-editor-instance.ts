/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The route segment of the new-video editor (`/admin/videos/new`). */
export const NEW_VIDEO_SEGMENT = 'new';

/**
 * Which `VideoForm` the editor host renders, and when to replace it. `key`
 * changes only for a real move to another video, so the form instance (and
 * everything the admin did in it) survives the router rendering the edit
 * route of the draft this form created.
 */
export interface EditorInstance {
  key: number;
  /** The editor route segment this instance last saw: `new` or a video id. */
  segment: string | null;
  /** The video the form opened with; `undefined` for a new video. */
  videoId: string | undefined;
  /** The draft this form created, once it has. */
  draftId: string | null;
}

const videoIdFor = (segment: string | null): string | undefined =>
  segment === null || segment === NEW_VIDEO_SEGMENT ? undefined : segment;

export const initialEditorInstance = (segment: string | null): EditorInstance => ({
  key: 0,
  segment,
  videoId: videoIdFor(segment),
  draftId: null,
});

/** Record the draft the form created, before the URL swaps to its edit route. */
export const recordEditorDraft = (instance: EditorInstance, draftId: string): EditorInstance => ({
  ...instance,
  draftId,
});

/**
 * Follow a change of the editor route segment. The draft's URL swap is
 * reflected in the router's URL at once, and the next router refresh (any
 * server action that revalidates triggers one) renders the edit route for
 * it. That segment is this form's own draft, so the instance stays; any
 * other segment opens a fresh form.
 */
export const followEditorSegment = (
  instance: EditorInstance,
  segment: string | null
): EditorInstance => {
  if (segment === instance.segment) return instance;
  if (segment !== null && segment === instance.draftId) return { ...instance, segment };
  return { key: instance.key + 1, segment, videoId: videoIdFor(segment), draftId: null };
};

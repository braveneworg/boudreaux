/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

import { useSelectedLayoutSegment } from 'next/navigation';

import { VideoForm } from '../video-form';
import {
  followEditorSegment,
  initialEditorInstance,
  recordEditorDraft,
} from './video-editor-instance';

/**
 * Hosts the video form in the layout shared by `/admin/videos/new` and
 * `/admin/videos/[videoId]`. A new video's draft swaps the URL to its edit
 * route in place, and the next router refresh renders that route. Rendered
 * by the page, the form remounted then and dropped whatever the admin had
 * done since the swap. A layout survives a child segment change, so the
 * form instance stays for its own draft and is replaced for any other video.
 */
export const VideoEditorHost = (): ReactElement => {
  const segment = useSelectedLayoutSegment();
  const [instance, setInstance] = useState(() => initialEditorInstance(segment));

  // Adjust state while rendering when the segment changes (React's
  // "storing information from previous renders" pattern), so a fresh form
  // never renders with the previous video's key.
  let current = instance;
  if (segment !== instance.segment) {
    current = followEditorSegment(instance, segment);
    setInstance(current);
  }

  const handleDraftCreated = useCallback((draftId: string): void => {
    setInstance((previous) => recordEditorDraft(previous, draftId));
  }, []);

  return (
    <VideoForm key={current.key} videoId={current.videoId} onDraftCreated={handleDraftCreated} />
  );
};

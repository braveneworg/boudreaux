/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { VideoEditorHost } from '@/app/components/forms/videos/video-editor-host';

interface VideoEditorLayoutProps {
  children: ReactNode;
}

/**
 * Shared by `/admin/videos/new` and `/admin/videos/[videoId]`. The form lives
 * here, not in the pages, so it survives the router moving from the new-video
 * route to the edit route of the draft it created (see `VideoEditorHost`).
 */
export default function VideoEditorLayout({ children }: VideoEditorLayoutProps) {
  return (
    <>
      <VideoEditorHost />
      {children}
    </>
  );
}

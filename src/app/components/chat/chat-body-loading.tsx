/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Loader2 } from 'lucide-react';

interface ChatBodyLoadingProps {
  /** Accessible name for the spinner — says what is still on its way. */
  label: string;
}

/**
 * The drawer body's loading state: a centered spinner that fills the body's
 * footprint, so the drawer does not re-measure when the real content lands.
 * Shared by the lazy chat-body chunk (`ChatLauncher`) and ChatBody's own
 * first-fetch state.
 */
export const ChatBodyLoading = ({ label }: ChatBodyLoadingProps) => (
  <div className="flex flex-1 items-center justify-center p-8">
    <Loader2 aria-label={label} className="text-muted-foreground size-6 animate-spin" />
  </div>
);

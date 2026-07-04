/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { createContext, useContext, useMemo, useRef } from 'react';
import type { JSX, ReactNode } from 'react';

import type { Editor } from '@tiptap/react';

export interface BioEditorRegistryValue {
  register: (name: string, editor: Editor) => void;
  unregister: (name: string) => void;
  setActive: (name: string) => void;
  /** The focused editor, else the first registered, else null. */
  getTarget: () => Editor | null;
}

const NULL_REGISTRY: BioEditorRegistryValue = {
  register: () => {},
  unregister: () => {},
  setActive: () => {},
  getTarget: () => null,
};

const BioEditorRegistryContext = createContext<BioEditorRegistryValue>(NULL_REGISTRY);

/** Access the bio editor registry (a no-op registry outside the provider). */
export const useBioEditorRegistry = (): BioEditorRegistryValue =>
  useContext(BioEditorRegistryContext);

/**
 * Tracks the bio editors on the artist form so the media palettes can insert
 * at the focused editor's cursor (click-to-insert — the touch and keyboard
 * path; HTML5 drag does not exist on touchscreens). Refs, not state: focus
 * changes must not re-render the whole form.
 */
export const BioEditorRegistryProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const editorsRef = useRef(new Map<string, Editor>());
  const activeRef = useRef<string | null>(null);

  const value = useMemo<BioEditorRegistryValue>(
    () => ({
      register: (name, editor) => {
        editorsRef.current.set(name, editor);
      },
      unregister: (name) => {
        editorsRef.current.delete(name);
        if (activeRef.current === name) activeRef.current = null;
      },
      setActive: (name) => {
        activeRef.current = name;
      },
      getTarget: () => {
        const active = activeRef.current ? editorsRef.current.get(activeRef.current) : undefined;
        return active ?? editorsRef.current.values().next().value ?? null;
      },
    }),
    []
  );

  return (
    <BioEditorRegistryContext.Provider value={value}>{children}</BioEditorRegistryContext.Provider>
  );
};

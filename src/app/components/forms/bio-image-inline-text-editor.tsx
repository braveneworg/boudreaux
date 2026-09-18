/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';

import { Check, X } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';

/** The longest value any bio image text field accepts (mirrors the Zod caps). */
const MAX_LENGTH = 500;

interface BioImageInlineTextEditorProps {
  /** Accessible name of the input, e.g. "Attribution" or "Alt text". */
  label: string;
  /** The value being edited; the editor keeps its own draft until Save. */
  initialValue: string;
  /** Called with the trimmed draft on Save or Enter. */
  onSave: (value: string) => void;
  /** Called on Cancel or Escape. */
  onCancel: () => void;
}

/**
 * Inline single-line editor for one bio image text field (attribution or alt
 * text): Enter or Save commits the trimmed draft, Escape or Cancel abandons it.
 */
export const BioImageInlineTextEditor = ({
  label,
  initialValue,
  onSave,
  onCancel,
}: BioImageInlineTextEditorProps): JSX.Element => {
  const [draft, setDraft] = useState(initialValue);

  const save = (): void => {
    onSave(draft.trim());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') save();
    if (event.key === 'Escape') onCancel();
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_LENGTH}
        className="h-6 text-[11px]"
      />
      <div className="flex gap-1">
        <Button type="button" size="sm" onClick={save} className="h-5 px-2 text-[11px]">
          <Check className="size-3" aria-hidden />
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="h-5 px-2 text-[11px]"
        >
          <X className="size-3" aria-hidden />
          Cancel
        </Button>
      </div>
    </div>
  );
};

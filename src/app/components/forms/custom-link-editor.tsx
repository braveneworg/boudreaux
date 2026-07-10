/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';

import { Plus } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { useCreateBioLinkMutation } from '@/app/hooks/mutations/use-bio-media-mutations';
import { isHttpUrl } from '@/lib/utils/is-http-url';
import { BIO_LINK_KINDS, type BioLinkKind } from '@/lib/validation/bio-link-input-schema';

interface CustomLinkEditorProps {
  artistId: string;
}

/**
 * Compact "Add link" row for authoring one custom bio link (label + URL +
 * optional kind). Persists via the create mutation, which stamps
 * `origin: 'custom'` so the row survives regeneration and joins the link
 * palette. Fields clear on a successful create; an invalid URL is flagged
 * inline and blocks submit, while server errors surface as a toast from the
 * mutation hook. Follows the inline attribution-editor precedent (local
 * `useState`, no form library) since the row is tiny and nested inside the
 * artist admin form (a nested `<form>` would be invalid HTML).
 */
export const CustomLinkEditor = ({ artistId }: CustomLinkEditorProps): JSX.Element => {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'' | BioLinkKind>('');
  const hintId = useId();

  const reset = (): void => {
    setLabel('');
    setUrl('');
    setKind('');
  };

  const { createBioLink, isCreatingBioLink } = useCreateBioLinkMutation(artistId, reset);

  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  const urlInvalid = trimmedUrl.length > 0 && !isHttpUrl(trimmedUrl);
  const canSubmit = trimmedLabel.length > 0 && isHttpUrl(trimmedUrl) && !isCreatingBioLink;

  const submit = (): void => {
    if (!canSubmit) return;
    createBioLink({
      artistId,
      label: trimmedLabel,
      url: trimmedUrl,
      ...(kind ? { kind } : {}),
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div role="group" aria-label="Add custom link" className="border-border space-y-2 border p-2">
      <h3 className="text-sm font-semibold">Add link</h3>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Link label"
          placeholder="Label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={200}
          className="h-8 text-xs"
        />
        <Input
          aria-label="Link URL"
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-invalid={urlInvalid}
          aria-describedby={urlInvalid ? hintId : undefined}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex items-center gap-2">
        <Select value={kind} onValueChange={(value) => setKind(value as BioLinkKind)}>
          <SelectTrigger aria-label="Link kind" size="sm" className="h-8 flex-1 text-xs">
            <SelectValue placeholder="Kind (optional)" />
          </SelectTrigger>
          <SelectContent>
            {BIO_LINK_KINDS.map((option) => (
              <SelectItem key={option} value={option} className="text-xs">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit}
          onClick={submit}
          className="h-8 shrink-0 px-2 text-xs"
        >
          <Plus className="size-3.5" aria-hidden />
          {isCreatingBioLink ? 'Adding…' : 'Add link'}
        </Button>
      </div>
      {urlInvalid && (
        <p id={hintId} role="alert" className="text-destructive text-[11px]">
          Enter a valid http(s) URL
        </p>
      )}
    </div>
  );
};

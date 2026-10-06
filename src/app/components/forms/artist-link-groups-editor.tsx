/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';

import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { useFieldArray, useWatch } from 'react-hook-form';

import { Button } from '@/app/components/ui/button';
import { FormControl, FormField, FormItem, FormMessage } from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { moveByOne } from '@/lib/utils/move-by-one';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { ArtistLinkListEditor } from './artist-link-list-editor';

import type { Control } from 'react-hook-form';

interface ArtistLinkGroupsEditorProps {
  control: Control<ArtistFormData>;
}

interface LinkGroupProps {
  control: Control<ArtistFormData>;
  index: number;
  count: number;
  heading: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
}

/** One Contact & Misc group: its heading input, controls, and its own link list. */
const LinkGroup = ({
  control,
  index,
  count,
  heading,
  onMove,
  onRemove,
}: LinkGroupProps): JSX.Element => {
  const position = `Group ${index + 1}`;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onMove(index, -1);
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onMove(index, 1);
    }
  };

  return (
    <fieldset aria-label={heading || position} className="space-y-2 border border-black p-3">
      <div className="flex items-start gap-2">
        <FormField
          control={control}
          name={`contactLinkGroups.${index}.heading`}
          render={({ field }) => (
            <FormItem className="min-w-0 flex-1">
              <FormControl>
                <Input
                  {...field}
                  value={String(field.value ?? '')}
                  aria-label={`${position} heading`}
                  placeholder="Heading (e.g. Booking)"
                  className="font-semibold"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            onKeyDown={handleKeyDown}
            aria-label={`Move group ${index + 1} earlier`}
            className="hover:text-primary p-1 disabled:opacity-40"
          >
            <ChevronUp className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(index, 1)}
            onKeyDown={handleKeyDown}
            aria-label={`Move group ${index + 1} later`}
            className="hover:text-primary p-1 disabled:opacity-40"
          >
            <ChevronDown className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`Remove group ${index + 1}`}
            className="hover:text-destructive p-1"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <ArtistLinkListEditor
        control={control}
        name={`contactLinkGroups.${index}.links`}
        heading={position}
        section="contact"
        addLabel={`Add link to group ${index + 1}`}
        emptyCopy="No links yet."
        urlPlaceholder="URL, email address or phone number"
      />
    </fieldset>
  );
};

/**
 * The Contact & Misc section: admin-defined groups, each a heading over its
 * own link list (ADR-0020). Groups reorder like links do; the prefilled
 * Booking and Merch headings come from the form's defaults, so they do not
 * dirty the form and are not saved while empty.
 */
export const ArtistLinkGroupsEditor = ({ control }: ArtistLinkGroupsEditorProps): JSX.Element => {
  const { fields, append, remove, move } = useFieldArray({ control, name: 'contactLinkGroups' });
  const groups = useWatch({ control, name: 'contactLinkGroups' }) ?? [];
  const [announcement, setAnnouncement] = useState('');

  const handleMove = (index: number, direction: -1 | 1): void => {
    if (!moveByOne(fields, index, direction)) return;
    const subject = groups.at(index)?.heading || 'Group';
    setAnnouncement(`${subject} is now group ${index + direction + 1} of ${fields.length}`);
    move(index, index + direction);
  };

  return (
    <div className="space-y-3">
      {fields.length === 0 && <p className="text-muted-foreground text-sm">No groups yet.</p>}
      {fields.map((field, index) => (
        <LinkGroup
          key={field.id}
          control={control}
          index={index}
          count={fields.length}
          heading={groups.at(index)?.heading ?? ''}
          onMove={handleMove}
          onRemove={remove}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ heading: '', links: [] })}
      >
        <Plus className="mr-1 size-4" aria-hidden />
        Add group
      </Button>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};

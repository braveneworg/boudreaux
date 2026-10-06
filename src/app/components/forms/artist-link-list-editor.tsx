/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';

import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { useFieldArray, useWatch } from 'react-hook-form';

import { ArtistLinkIcon } from '@/app/components/ui/artist-link-icon';
import { Button } from '@/app/components/ui/button';
import { FormControl, FormField, FormItem, FormMessage } from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import type { ArtistLinkSection } from '@/lib/utils/artist-links';
import { moveByOne } from '@/lib/utils/move-by-one';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import type { Control, FieldPath } from 'react-hook-form';

/** The form arrays that hold a flat list of links (ADR-0020). */
export type ArtistLinkListName =
  'websiteLinks' | 'socialLinks' | `contactLinkGroups.${number}.links`;

interface ArtistLinkListEditorProps {
  control: Control<ArtistFormData>;
  name: ArtistLinkListName;
  /** Names the rows for assistive technology: "Website link 2 URL". */
  heading: string;
  /** Decides the live icon and the URL hint. */
  section: ArtistLinkSection;
  addLabel: string;
  emptyCopy?: string;
  urlPlaceholder?: string;
}

/** The accessible-name prefix of a row: "Website link 2". */
const rowName = (heading: string, index: number): string => `${heading} link ${index + 1}`;

interface LinkRowProps {
  control: Control<ArtistFormData>;
  name: ArtistLinkListName;
  heading: string;
  section: ArtistLinkSection;
  index: number;
  count: number;
  urlPlaceholder: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
}

/** One link row: label and URL inputs (each a registered field), the live icon, and the controls. */
const LinkRow = ({
  control,
  name,
  heading,
  section,
  index,
  count,
  urlPlaceholder,
  onMove,
  onRemove,
}: LinkRowProps): JSX.Element => {
  const urlName: FieldPath<ArtistFormData> = `${name}.${index}.url`;
  const labelName: FieldPath<ArtistFormData> = `${name}.${index}.label`;
  const url = useWatch({ control, name: urlName }) ?? '';
  const title = rowName(heading, index);

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
    <li className="flex flex-wrap items-start gap-2 md:flex-nowrap">
      {section === 'social' && (
        <ArtistLinkIcon href={String(url)} section={section} className="mt-2.5" />
      )}
      <FormField
        control={control}
        name={labelName}
        render={({ field }) => (
          <FormItem className="min-w-0 basis-full md:basis-1/3">
            <FormControl>
              <Input
                {...field}
                value={String(field.value ?? '')}
                aria-label={`${title} label`}
                placeholder="Label (optional)"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={urlName}
        render={({ field }) => (
          <FormItem className="min-w-0 flex-1">
            <FormControl>
              <Input
                {...field}
                value={String(field.value ?? '')}
                aria-label={`${title} URL`}
                placeholder={urlPlaceholder}
                inputMode="url"
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
          aria-label={`Move ${title.toLowerCase()} earlier`}
          className="hover:text-primary p-1 disabled:opacity-40"
        >
          <ChevronUp className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled={index === count - 1}
          onClick={() => onMove(index, 1)}
          onKeyDown={handleKeyDown}
          aria-label={`Move ${title.toLowerCase()} later`}
          className="hover:text-primary p-1 disabled:opacity-40"
        >
          <ChevronDown className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label={`Remove ${title.toLowerCase()}`}
          className="hover:text-destructive p-1"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
};

/**
 * An ordered list of `{ label?, url }` rows backed by `useFieldArray`. Every
 * input is a `FormField`, so the rows stay registered (reset, dirty tracking
 * and defaults keep working); the move buttons also take the arrow keys and
 * announce the new position politely. A social row shows the icon its href
 * resolves to as it is typed.
 */
export const ArtistLinkListEditor = ({
  control,
  name,
  heading,
  section,
  addLabel,
  emptyCopy = `No ${heading.toLowerCase()} links yet.`,
  urlPlaceholder = 'https://…',
}: ArtistLinkListEditorProps): JSX.Element => {
  const { fields, append, remove, move } = useFieldArray({ control, name });
  const values = useWatch({ control, name }) ?? [];
  const [announcement, setAnnouncement] = useState('');

  const handleMove = (index: number, direction: -1 | 1): void => {
    if (!moveByOne(fields, index, direction)) return;
    const row = values.at(index);
    const subject = row?.label || row?.url || 'Link';
    setAnnouncement(
      `${subject} is now ${heading.toLowerCase()} link ${index + direction + 1} of ${fields.length}`
    );
    move(index, index + direction);
  };

  return (
    <div className="space-y-2">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyCopy}</p>
      ) : (
        <ol aria-label={`${heading} links`} className="space-y-2">
          {fields.map((field, index) => (
            <LinkRow
              key={field.id}
              control={control}
              name={name}
              heading={heading}
              section={section}
              index={index}
              count={fields.length}
              urlPlaceholder={urlPlaceholder}
              onMove={handleMove}
              onRemove={remove}
            />
          ))}
        </ol>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ label: '', url: '' })}
      >
        <Plus className="mr-1 size-4" aria-hidden />
        {addLabel}
      </Button>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';

import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { useFieldArray, useWatch } from 'react-hook-form';

import { ArtistLinkIcon } from '@/app/components/artist-link-icon';
import { Button } from '@/app/components/ui/button';
import { FormControl, FormField, FormItem, FormMessage } from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { cn } from '@/lib/utils';
import { moveByOne } from '@/lib/utils/move-by-one';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import type { Control, FieldPath } from 'react-hook-form';

/**
 * A form array that holds a flat list of links, with the section it belongs
 * to (ADR-0020). The section decides the live icon and whether a row has a
 * description. The pair is one type, so a row's `description` path exists
 * only where the schema has one: under a Contact & Misc group.
 */
export type ArtistLinkListTarget =
  | { name: 'websiteLinks'; section: 'websites' }
  | { name: 'socialLinks'; section: 'social' }
  | { name: `contactLinkGroups.${number}.links`; section: 'contact' };

type ArtistLinkListEditorProps = ArtistLinkListTarget & {
  control: Control<ArtistFormData>;
  /** Names the rows for assistive technology: "Website link 2 URL". */
  heading: string;
  addLabel: string;
  emptyCopy?: string;
  urlPlaceholder?: string;
};

type LinkRowValues = NonNullable<ArtistFormData['websiteLinks']>[number];
type ContactLinkRowValues = NonNullable<
  ArtistFormData['contactLinkGroups']
>[number]['links'][number];

/** The row an "Add" button appends: every input empty, as a loaded row without the value is. */
const EMPTY_LINK: LinkRowValues = { label: '', url: '' };
const EMPTY_CONTACT_LINK: ContactLinkRowValues = { label: '', description: '', url: '' };

/** The accessible-name prefix of a row: "Website link 2". */
const rowName = (heading: string, index: number): string => `${heading} link ${index + 1}`;

type LinkRowProps = ArtistLinkListTarget & {
  control: Control<ArtistFormData>;
  heading: string;
  index: number;
  count: number;
  urlPlaceholder: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
};

/**
 * One link row: label and URL inputs, the live icon of a social row, and the
 * controls. A Contact & Misc row also has a description input, on its own
 * line under the other two and after them in the tab order. Every input is a
 * registered field.
 */
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
    <li
      className={cn(
        'flex flex-wrap items-start gap-2',
        // A contact row is a grid from `md` up, with the label and URL
        // columns as wide as the flex line gives them, so its description
        // can span exactly those two.
        section === 'contact'
          ? 'md:grid md:grid-cols-[calc(100%/3)_minmax(0,1fr)_auto]'
          : 'md:flex-nowrap'
      )}
    >
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
      {section === 'contact' && (
        <FormField
          control={control}
          name={`${name}.${index}.description`}
          render={({ field }) => (
            <FormItem className="order-last min-w-0 basis-full md:col-span-2">
              <FormControl>
                <Input
                  {...field}
                  value={String(field.value ?? '')}
                  aria-label={`${title} description`}
                  placeholder="Description (optional)"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
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
 * An ordered list of `{ label?, url }` rows — `{ label?, description?, url }`
 * in Contact & Misc — backed by `useFieldArray`. Every input is a
 * `FormField`, so the rows stay registered (reset, dirty tracking and
 * defaults keep working); the move buttons also take the arrow keys and
 * announce the new position politely. A social row shows the icon its href
 * resolves to as it is typed.
 */
export const ArtistLinkListEditor = ({
  control,
  heading,
  addLabel,
  emptyCopy = `No ${heading.toLowerCase()} links yet.`,
  urlPlaceholder = 'https://…',
  ...target
}: ArtistLinkListEditorProps): JSX.Element => {
  const { name, section } = target;
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
              {...target}
              heading={heading}
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
        onClick={() => append(section === 'contact' ? EMPTY_CONTACT_LINK : EMPTY_LINK)}
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

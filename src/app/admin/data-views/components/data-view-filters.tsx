/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import { cn } from '@/lib/utils';

import type { DataViewFilters } from '../data-view-types';

interface DataViewFiltersToolbarProps {
  filters: DataViewFilters;
  /** Display-friendly entity label, e.g. "featured artist". */
  entityDisplayLabel: string;
  /** Whether the entity supports soft delete (controls the "Show deleted" toggle). */
  supportsSoftDelete: boolean;
}

/** A labelled visibility toggle row. */
const FilterToggle = ({
  id,
  label,
  checked,
  onCheckedChange,
  className = 'mb-2',
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  className?: string;
}): ReactElement => (
  <div className={cn('flex items-center gap-2', className)}>
    <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    <Label htmlFor={id} className="cursor-pointer">
      {label}
    </Label>
  </div>
);

/** Search input plus the published/unpublished/deleted visibility toggles. */
export const DataViewFiltersToolbar = ({
  filters,
  entityDisplayLabel,
  supportsSoftDelete,
}: DataViewFiltersToolbarProps): ReactElement => (
  <>
    <Input
      className="my-4 w-full"
      type="search"
      value={filters.search}
      onChange={(e) => filters.onSearchChange(e.target.value)}
      placeholder={`Search ${entityDisplayLabel}s...`}
    />
    {supportsSoftDelete && (
      <FilterToggle
        id="show-deleted"
        label="Show deleted"
        checked={filters.showDeleted}
        onCheckedChange={filters.onShowDeletedChange}
      />
    )}
    <FilterToggle
      id="show-published"
      label="Show published"
      checked={filters.showPublished}
      onCheckedChange={filters.onShowPublishedChange}
    />
    <FilterToggle
      id="show-unpublished"
      label="Show unpublished"
      checked={filters.showUnpublished}
      onCheckedChange={filters.onShowUnpublishedChange}
      className="mb-4"
    />
  </>
);

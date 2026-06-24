/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { FormDescription } from '@/app/components/ui/form';
import { Switch } from '@/app/components/ui/switch';
import { VALID_FORMAT_TYPES } from '@/lib/constants/digital-formats';
import { FORMATS, type Format } from '@/lib/types/media-models';

// Common formats grouped for easier selection (digital formats managed via accordion)
const FORMAT_GROUPS = {
  Vinyl: [
    'VINYL',
    'VINYL_7_INCH',
    'VINYL_10_INCH',
    'VINYL_12_INCH',
    'VINYL_180G',
    'VINYL_COLORED',
    'VINYL_GATEFOLD',
    'VINYL_DOUBLE_LP',
  ] as Format[],
  Physical: ['CD', 'CASSETTE'] as Format[],
};

const formatDisplayName = (format: string): string =>
  format
    .replace(/_/g, ' ')
    .replace(/KBPS/g, 'kbps')
    .replace(/(\d+)G/g, '$1g')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

interface FormatSwitchProps {
  format: Format;
  formats: string[] | undefined;
  isSubmitting: boolean;
  onFormatChange: (format: Format, checked: boolean) => void;
}

const FormatSwitch = ({
  format,
  formats,
  isSubmitting,
  onFormatChange,
}: FormatSwitchProps): React.ReactElement => (
  <div className="flex items-center justify-between">
    <label
      htmlFor={`format-${format}`}
      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    >
      {formatDisplayName(format)}
    </label>
    <Switch
      id={`format-${format}`}
      checked={formats?.includes(format) || false}
      onCheckedChange={(checked) => onFormatChange(format, checked as boolean)}
      disabled={isSubmitting}
    />
  </div>
);

interface ReleaseFormatsSectionProps {
  formats: string[] | undefined;
  isSubmitting: boolean;
  onFormatChange: (format: Format, checked: boolean) => void;
}

const otherFormats = Object.values(FORMATS).filter(
  (format) =>
    !VALID_FORMAT_TYPES.includes(format as (typeof VALID_FORMAT_TYPES)[number]) &&
    format !== 'DIGITAL' &&
    !FORMAT_GROUPS.Vinyl.includes(format as Format) &&
    !FORMAT_GROUPS.Physical.includes(format as Format)
);

export const ReleaseFormatsSection = ({
  formats,
  isSubmitting,
  onFormatChange,
}: ReleaseFormatsSectionProps): React.ReactElement => (
  <section className="space-y-4">
    <h2 className="font-semibold">Formats *</h2>
    <FormDescription>Select all formats this release is available in.</FormDescription>
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {Object.entries(FORMAT_GROUPS).map(([groupName, groupFormats]) => (
        <div key={groupName} className="space-y-3">
          <h3 className="text-foreground text-2xl font-medium">{groupName}</h3>
          <div className="space-y-4">
            {groupFormats.map((format) => (
              <FormatSwitch
                key={format}
                format={format}
                formats={formats}
                isSubmitting={isSubmitting}
                onFormatChange={onFormatChange}
              />
            ))}
          </div>
        </div>
      ))}
    </div>

    {/* Show all other formats in a collapsible section */}
    <details className="mt-4">
      <summary className="hover:text-foreground cursor-pointer text-sm text-zinc-950">
        Show all formats ({Object.keys(FORMATS).length} total)
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
        {otherFormats.map((format) => (
          <FormatSwitch
            key={format}
            format={format as Format}
            formats={formats}
            isSubmitting={isSubmitting}
            onFormatChange={onFormatChange}
          />
        ))}
      </div>
    </details>
  </section>
);

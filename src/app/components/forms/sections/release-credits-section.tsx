/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { TextField } from '@/app/components/forms/fields';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

import type { Control } from 'react-hook-form';

interface ReleaseCreditsSectionProps {
  control: Control<ReleaseFormData>;
}

export const ReleaseCreditsSection = ({
  control,
}: ReleaseCreditsSectionProps): React.ReactElement => (
  <>
    {/* Credits Section */}
    <section className="space-y-4">
      <h2 className="font-semibold">Credits</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          control={control}
          name="executiveProducedBy"
          label="Executive Produced By"
          placeholder="Names (comma-separated)"
        />
        <TextField
          control={control}
          name="coProducedBy"
          label="Co-Produced By"
          placeholder="Names (comma-separated)"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          control={control}
          name="masteredBy"
          label="Mastered By"
          placeholder="Names (comma-separated)"
        />
        <TextField
          control={control}
          name="mixedBy"
          label="Mixed By"
          placeholder="Names (comma-separated)"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          control={control}
          name="recordedBy"
          label="Recorded By"
          placeholder="Names (comma-separated)"
        />
        <TextField
          control={control}
          name="linerNotesBy"
          label="Liner Notes By"
          placeholder="Names (comma-separated)"
        />
      </div>
    </section>

    <Separator />

    {/* Artwork Credits Section */}
    <section className="space-y-4">
      <h2 className="font-semibold">Artwork Credits</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          control={control}
          name="artBy"
          label="Art By"
          placeholder="Names (comma-separated)"
        />
        <TextField
          control={control}
          name="designBy"
          label="Design By"
          placeholder="Names (comma-separated)"
        />
      </div>
      <TextField
        control={control}
        name="photographyBy"
        label="Photography By"
        placeholder="Names (comma-separated)"
      />
    </section>

    <Separator />

    {/* Notes Section */}
    <section className="space-y-4">
      <h2 className="font-semibold">Notes</h2>
      <FormField
        control={control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Release Notes</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Additional notes (comma-separated for multiple)"
                className="min-h-20"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </section>
  </>
);

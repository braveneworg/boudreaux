/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Controller } from 'react-hook-form';

import {
  ProducerMultiCombobox,
  type ProducerPill,
} from '@/app/components/forms/fields/producer-multi-combobox';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { Control } from 'react-hook-form';

interface VideoProducersSectionProps {
  control: Control<VideoFormData>;
}

export const VideoProducersSection = ({
  control,
}: VideoProducersSectionProps): React.ReactElement => (
  <section className="space-y-3">
    <h2 className="font-semibold">Producers</h2>
    <Controller
      control={control}
      name="producers"
      render={({ field }) => (
        <ProducerMultiCombobox
          label="Producers"
          value={(field.value ?? []) as ProducerPill[]}
          onChange={field.onChange}
        />
      )}
    />
  </section>
);

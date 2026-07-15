/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type { ProducerPill } from '@/app/components/forms/fields/producer-multi-combobox';
import { createVideoSchema, type VideoFormData } from '@/lib/validation/create-video-schema';

import { VideoProducersSection } from './video-producers-section';

// --------------------------------------------------------------------------
// Mock: ProducerMultiCombobox — renders pills for value entries
// --------------------------------------------------------------------------
vi.mock('@/app/components/forms/fields/producer-multi-combobox', () => ({
  ProducerMultiCombobox: ({ value }: { value: ProducerPill[] }) => (
    <ul aria-label="Selected producers">
      {value.map((p) => (
        <li key={p.id ?? p.name}>{p.name}</li>
      ))}
    </ul>
  ),
}));

// --------------------------------------------------------------------------
// Wrapper: wire a real RHF form so <Controller> has a form context
// --------------------------------------------------------------------------
const Wrapper = ({ defaultProducers }: { defaultProducers: ProducerPill[] }) => {
  const { control } = useForm<VideoFormData>({
    resolver: zodResolver(createVideoSchema),
    defaultValues: {
      title: 'x',
      artist: 'x',
      category: 'MUSIC',
      releasedOn: '2024-01-01',
      s3Key: 'k',
      fileName: 'f.mp4',
      mimeType: 'video/mp4',
      producers: defaultProducers,
    },
  });
  return <VideoProducersSection control={control} />;
};

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------
describe('VideoProducersSection', () => {
  it('renders the producers combobox and reflects the field value as pills', () => {
    render(<Wrapper defaultProducers={[{ id: 'p1', name: 'Rick' }]} />);

    expect(screen.getByText('Rick')).toBeInTheDocument();
  });

  it('renders nothing for the pill list when producers is empty', () => {
    render(<Wrapper defaultProducers={[]} />);

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('renders the section heading', () => {
    render(<Wrapper defaultProducers={[]} />);

    expect(screen.getByRole('heading', { name: /producers/i })).toBeInTheDocument();
  });
});

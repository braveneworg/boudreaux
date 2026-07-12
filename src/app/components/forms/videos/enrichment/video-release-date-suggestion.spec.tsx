/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { VideoReleaseDateSuggestion } from './video-release-date-suggestion';

const suggestion = {
  id: 's3',
  artistId: null,
  field: 'releasedOn' as const,
  value: '2020-06-01',
  confidence: 'medium' as const,
  sources: [{ url: 'https://musicbrainz.org/release/y', label: 'MusicBrainz' }],
  note: null,
  status: 'pending' as const,
};

interface HarnessProps {
  releasedOn: string;
  onApplyReleaseDate: (value: string) => void;
  onDismiss: () => void;
}

const Harness = ({ releasedOn, onApplyReleaseDate, onDismiss }: HarnessProps) => {
  const form = useForm<VideoFormData>({ defaultValues: { releasedOn } });
  return (
    <VideoReleaseDateSuggestion
      suggestion={suggestion}
      control={form.control}
      name="releasedOn"
      onApplyReleaseDate={onApplyReleaseDate}
      onDismiss={onDismiss}
      isBusy={false}
    />
  );
};

describe('VideoReleaseDateSuggestion', () => {
  it('renders the suggested date', () => {
    render(<Harness releasedOn="2026-02-01" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText('2020-06-01')).toBeInTheDocument();
  });

  it('shows the current form value beside the suggestion', () => {
    render(<Harness releasedOn="2026-02-01" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText(/Current: 2026-02-01/)).toBeInTheDocument();
  });

  it('shows a dash as the current value when the form field is empty', () => {
    render(<Harness releasedOn="" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('applies into the form via onApplyReleaseDate — never a server call', async () => {
    const onApplyReleaseDate = vi.fn();
    render(
      <Harness
        releasedOn="2026-02-01"
        onApplyReleaseDate={onApplyReleaseDate}
        onDismiss={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Apply Release date suggestion' }));

    expect(onApplyReleaseDate).toHaveBeenCalledWith('2020-06-01');
  });

  it('shows the save hint once the form value matches the suggestion', () => {
    render(<Harness releasedOn="2020-06-01" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText(/Save to persist/)).toBeInTheDocument();
  });

  it('marks the row applied once the form value matches the suggestion', () => {
    render(<Harness releasedOn="2020-06-01" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText('Applied')).toBeInTheDocument();
  });

  it('hides the save hint before the suggestion is applied', () => {
    render(<Harness releasedOn="2026-02-01" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.queryByText(/Save to persist/)).not.toBeInTheDocument();
  });

  it('forwards Dismiss to the server-dismiss callback', async () => {
    const onDismiss = vi.fn();
    render(<Harness releasedOn="2026-02-01" onApplyReleaseDate={vi.fn()} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Release date suggestion' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

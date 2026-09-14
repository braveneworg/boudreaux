// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { Form } from '@/app/components/ui/form';
import { createVideoSchema } from '@/lib/validation/create-video-schema';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { ReleaseDateField } from './release-date-field';

import type { ReleaseDateLookupStatus } from './use-release-date-auto-lookup';

vi.mock('@/ui/datepicker', () => ({
  DatePicker: ({
    onSelect,
    fieldName,
    value,
  }: {
    onSelect?: (dateString: string, fieldName: string) => void;
    fieldName: string;
    value?: string;
  }) => (
    <input
      aria-label="release-date"
      value={value ?? ''}
      onChange={(e) => onSelect?.(e.target.value, fieldName)}
    />
  ),
}));

interface WrapperProps {
  onSelectDate?: (dateString: string, fieldName: string) => void;
  lookupStatus?: ReleaseDateLookupStatus;
}

const Wrapper = ({ onSelectDate = vi.fn(), lookupStatus }: WrapperProps): React.ReactElement => {
  const form = useForm<VideoFormData>({
    resolver: zodResolver(createVideoSchema),
    defaultValues: {
      title: '',
      artist: '',
      category: 'MUSIC',
      description: '',
      releasedOn: '',
      s3Key: '',
      fileName: '',
      mimeType: 'video/mp4',
    },
  });

  return (
    <Form {...form}>
      <ReleaseDateField
        control={form.control}
        onSelectDate={onSelectDate}
        lookupStatus={lookupStatus}
      />
    </Form>
  );
};

describe('ReleaseDateField', () => {
  it('labels the date picker', () => {
    render(<Wrapper />);

    expect(screen.getByText('Release date')).toBeInTheDocument();
    expect(screen.getByLabelText('release-date')).toBeInTheDocument();
  });

  it('has no lookup button — the lookup is automatic', () => {
    render(<Wrapper />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('forwards a picked date to onSelectDate with the field name', async () => {
    const onSelectDate = vi.fn();
    render(<Wrapper onSelectDate={onSelectDate} />);

    await userEvent.type(screen.getByLabelText('release-date'), '2');

    expect(onSelectDate).toHaveBeenCalledWith('2', 'releasedOn');
  });

  it('shows the searching hint while the lookup is on the wire', () => {
    render(<Wrapper lookupStatus="searching" />);

    expect(screen.getByRole('status')).toHaveTextContent('Looking up release date…');
  });

  it('shows the set-it-manually hint once the lookup has given up', () => {
    render(<Wrapper lookupStatus="exhausted" />);

    expect(screen.getByRole('status')).toHaveTextContent('No release date found. Set it manually.');
  });

  it('shows no hint while idle', () => {
    render(<Wrapper lookupStatus="idle" />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows no hint once a date was found', () => {
    render(<Wrapper lookupStatus="found" />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('defaults to no hint when no status is given', () => {
    render(<Wrapper />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('announces the hint politely', () => {
    render(<Wrapper lookupStatus="searching" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});

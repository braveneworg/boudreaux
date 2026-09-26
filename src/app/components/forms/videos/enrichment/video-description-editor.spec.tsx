/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { Form } from '@/app/components/ui/form';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { VideoDescriptionEditor } from './video-description-editor';

interface HarnessProps {
  description?: string;
  /** Receives the live form so tests can read what the editor wrote. */
  onForm?: (form: UseFormReturn<VideoFormData>) => void;
}

/** A real RHF form providing the context the bound editor needs. */
const Harness = ({ description, onForm }: HarnessProps): React.ReactElement => {
  const form = useForm<VideoFormData>({
    defaultValues: description === undefined ? {} : { description },
  });
  onForm?.(form);
  return (
    <Form {...form}>
      <VideoDescriptionEditor control={form.control} />
    </Form>
  );
};

describe('VideoDescriptionEditor', () => {
  it('labels the textarea Description and seeds it from the form', () => {
    render(<Harness description="Stored prose about the video." />);

    expect(screen.getByLabelText('Description')).toHaveValue('Stored prose about the video.');
  });

  it('renders an empty textarea when the form holds no description', () => {
    render(<Harness />);

    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('writes typed text into the form description', async () => {
    let form: UseFormReturn<VideoFormData> | undefined;
    render(
      <Harness
        description=""
        onForm={(instance) => {
          form = instance;
        }}
      />
    );

    await userEvent.type(screen.getByLabelText('Description'), 'Typed by hand.');

    expect(form?.getValues('description')).toBe('Typed by hand.');
  });

  it('offers no generate or apply control of its own', () => {
    render(<Harness description="" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

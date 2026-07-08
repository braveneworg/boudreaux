/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { Form } from '@/app/components/ui/form';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { type UseVideoUploadResult } from './use-video-upload';
import { VideoFileSection } from './video-file-section';
import { buildVideoDefaults } from './video-form-helpers';

const baseUpload: UseVideoUploadResult = {
  status: 'idle',
  progress: 0,
  errorMessage: null,
  selectFile: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
};

const Harness = ({
  upload,
  defaults,
}: {
  upload: UseVideoUploadResult;
  defaults?: Partial<VideoFormData>;
}): React.ReactElement => {
  const form = useForm<VideoFormData>({
    defaultValues: { ...buildVideoDefaults(), ...defaults },
  });
  return (
    <Form {...form}>
      <VideoFileSection control={form.control} upload={upload} />
    </Form>
  );
};

describe('VideoFileSection', () => {
  it('renders the idle dropzone when there is no uploaded file', () => {
    render(<Harness upload={baseUpload} />);

    expect(screen.getByLabelText('Choose a video file')).toBeInTheDocument();
  });

  it('falls back to a generic message when an errored upload has no message', () => {
    render(<Harness upload={{ ...baseUpload, status: 'error', errorMessage: null }} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed.');
  });

  it('falls back to a generic file name in the done state', () => {
    render(<Harness upload={baseUpload} defaults={{ s3Key: 'key', fileName: undefined }} />);

    expect(screen.getByText('Video file')).toBeInTheDocument();
  });

  it('shows an "Uploaded" hint when the done state has no file size', () => {
    render(<Harness upload={baseUpload} defaults={{ s3Key: 'key', fileName: 'clip.mp4' }} />);

    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });
});

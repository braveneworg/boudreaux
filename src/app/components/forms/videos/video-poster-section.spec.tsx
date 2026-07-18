/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { posterCandidateToFile, VideoPosterSection } from './video-poster-section';

import type { Control } from 'react-hook-form';

interface HarnessProps {
  candidate?: Blob | null;
  uploadedPosterUrl?: string | null;
  isUploading?: boolean;
  errorMessage?: string | null;
  uploadPoster?: (file: File) => Promise<void>;
  existingPosterUrl?: string;
}

// Renders the section with a real RHF control (so `posterUrl` can be watched)
// and fully-injected upload props — mirroring how VideoForm now wires it.
const Harness = ({
  candidate = null,
  uploadedPosterUrl = null,
  isUploading = false,
  errorMessage = null,
  uploadPoster = async () => undefined,
  existingPosterUrl,
}: HarnessProps): React.ReactElement => {
  const form = useForm<VideoFormData>({
    defaultValues: { posterUrl: existingPosterUrl ?? '' } as Partial<VideoFormData>,
  });
  return (
    <VideoPosterSection
      control={form.control as Control<VideoFormData>}
      candidate={candidate}
      uploadedPosterUrl={uploadedPosterUrl}
      isUploading={isUploading}
      errorMessage={errorMessage}
      uploadPoster={uploadPoster}
    />
  );
};

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:candidate');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('VideoPosterSection — props-injected upload', () => {
  it('calls the injected uploadPoster with the candidate frame when Use this frame is clicked', async () => {
    const uploadPoster = vi.fn<(file: File) => Promise<void>>(async () => undefined);
    const candidate = new Blob(['jpeg'], { type: 'image/jpeg' });
    const user = userEvent.setup();
    render(<Harness candidate={candidate} uploadPoster={uploadPoster} />);

    await user.click(screen.getByRole('button', { name: 'Use this frame' }));

    await waitFor(() => expect(uploadPoster).toHaveBeenCalledTimes(1));
    const [file] = uploadPoster.mock.calls[0];
    expect(file.name).toBe('poster.jpg');
  });

  it('calls the injected uploadPoster with a manually picked image', async () => {
    const uploadPoster = vi.fn<(file: File) => Promise<void>>(async () => undefined);
    const user = userEvent.setup();
    render(<Harness uploadPoster={uploadPoster} />);

    const image = new File(['png'], 'poster.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload a poster image'), image);

    await waitFor(() => expect(uploadPoster).toHaveBeenCalledWith(image));
  });

  it('shows the uploaded poster preview when uploadedPosterUrl is provided', () => {
    render(<Harness uploadedPosterUrl="https://cdn.example.com/poster.jpg" />);

    expect(screen.getByAltText('Video poster')).toHaveAttribute(
      'src',
      'https://cdn.example.com/poster.jpg'
    );
  });

  it('shows the existing poster preview when only posterUrl is set', () => {
    render(<Harness existingPosterUrl="https://cdn.example.com/existing.jpg" />);

    expect(screen.getByAltText('Video poster')).toHaveAttribute(
      'src',
      'https://cdn.example.com/existing.jpg'
    );
  });

  it('disables Use this frame while an upload is in flight', () => {
    const candidate = new Blob(['jpeg'], { type: 'image/jpeg' });
    render(<Harness candidate={candidate} isUploading />);

    expect(screen.getByRole('button', { name: 'Use this frame' })).toBeDisabled();
  });

  it('hides Use this frame once a poster has been uploaded this session', () => {
    const candidate = new Blob(['jpeg'], { type: 'image/jpeg' });
    render(
      <Harness candidate={candidate} uploadedPosterUrl="https://cdn.example.com/poster.jpg" />
    );

    expect(screen.queryByRole('button', { name: 'Use this frame' })).not.toBeInTheDocument();
  });

  it('renders the injected error message inline', () => {
    render(<Harness errorMessage="presign boom" />);

    expect(screen.getByRole('alert')).toHaveTextContent('presign boom');
  });
});

describe('posterCandidateToFile', () => {
  it('wraps a candidate blob as a poster.jpg JPEG File', () => {
    const file = posterCandidateToFile(new Blob(['jpeg'], { type: 'image/jpeg' }));

    expect(file.name).toBe('poster.jpg');
    expect(file.type).toBe('image/jpeg');
  });
});

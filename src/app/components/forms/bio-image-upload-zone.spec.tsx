/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';

import { BioImageUploadZone, type BioImageUploadZoneProps } from './bio-image-upload-zone';
import { uploadBioImage } from './utils/upload-bio-image';

vi.mock('./utils/upload-bio-image', () => ({ uploadBioImage: vi.fn() }));

const record = { id: 'img-9', artistId: 'a1', url: 'https://cdn/x.webp' } as ArtistBioImageRecord;

const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
const text = new File(['x'], 'notes.txt', { type: 'text/plain' });

const renderZone = (overrides: Partial<BioImageUploadZoneProps> = {}) => {
  const props: BioImageUploadZoneProps = { artistId: 'a1', onUploaded: vi.fn(), ...overrides };
  render(<BioImageUploadZone {...props} />);
  return { ...props, input: screen.getByLabelText('Upload bio image') };
};

beforeEach(() => {
  vi.mocked(uploadBioImage).mockReset();
});

describe('BioImageUploadZone', () => {
  it('collects alt text and attribution before the file', () => {
    renderZone();
    expect(screen.getByLabelText('Alt text')).toBeInTheDocument();
    expect(screen.getByLabelText('Attribution (optional)')).toBeInTheDocument();
  });

  it('hints that alt text is needed for a display image while it is blank', async () => {
    renderZone();
    expect(screen.getByText(/Add alt text to use this upload/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Alt text'), 'Ceschi on stage');
    expect(screen.queryByText(/Add alt text to use this upload/)).not.toBeInTheDocument();
  });

  it('runs the upload pipeline with the trimmed fields and reports the row', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({ success: true, data: record });
    const { onUploaded, input } = renderZone();
    await userEvent.type(screen.getByLabelText('Alt text'), '  Ceschi on stage ');
    await userEvent.type(screen.getByLabelText('Attribution (optional)'), 'Photo by Sam ');
    await userEvent.upload(input, jpeg);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(record));
    expect(uploadBioImage).toHaveBeenCalledWith(jpeg, {
      artistId: 'a1',
      attribution: 'Photo by Sam',
      alt: 'Ceschi on stage',
    });
  });

  it('sends a null alt and an empty attribution when both are blank', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({ success: true, data: record });
    const { input } = renderZone();
    await userEvent.upload(input, jpeg);

    await waitFor(() =>
      expect(uploadBioImage).toHaveBeenCalledWith(jpeg, {
        artistId: 'a1',
        attribution: '',
        alt: null,
      })
    );
  });

  it('clears the fields after a successful upload', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({ success: true, data: record });
    const { input } = renderZone();
    await userEvent.type(screen.getByLabelText('Alt text'), 'Ceschi');
    await userEvent.upload(input, jpeg);

    await waitFor(() => expect(screen.getByLabelText('Alt text')).toHaveValue(''));
  });

  it('shows the pipeline error inline and keeps the fields', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({ success: false, error: 'S3 refused' });
    const { onUploaded, input } = renderZone();
    await userEvent.type(screen.getByLabelText('Alt text'), 'Ceschi');
    await userEvent.upload(input, jpeg);

    expect(await screen.findByRole('alert')).toHaveTextContent('S3 refused');
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Alt text')).toHaveValue('Ceschi');
  });

  it('falls back to a generic error when the pipeline gives none', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({ success: false });
    const { input } = renderZone();
    await userEvent.upload(input, jpeg);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to upload image');
  });

  it('rejects a non-image file without starting the pipeline', async () => {
    const { input } = renderZone();
    await userEvent.upload(input, text, { applyAccept: false });

    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG, or WebP/);
    expect(uploadBioImage).not.toHaveBeenCalled();
  });

  it('accepts a dropped file through the drop zone', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({ success: true, data: record });
    const { onUploaded, input } = renderZone();
    const zone = input.parentElement as HTMLElement;

    fireEvent.dragOver(zone, { dataTransfer: { files: [jpeg] } });
    fireEvent.drop(zone, { dataTransfer: { files: [jpeg] } });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(record));
  });

  it('ignores a drop that carries no file', async () => {
    const { input } = renderZone();
    const zone = input.parentElement as HTMLElement;

    fireEvent.drop(zone, { dataTransfer: { files: [] } });

    await waitFor(() => expect(uploadBioImage).not.toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('disables the inputs and the drop zone when disabled', () => {
    const { input } = renderZone({ disabled: true });
    expect(input).toBeDisabled();
    expect(screen.getByLabelText('Alt text')).toBeDisabled();
  });

  it('shows an uploading status while the pipeline runs', async () => {
    let resolveUpload: (value: {
      success: boolean;
      data?: ArtistBioImageRecord;
    }) => void = () => {};
    vi.mocked(uploadBioImage).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve;
      })
    );
    const { input } = renderZone();
    await userEvent.upload(input, jpeg);

    expect(await screen.findByRole('status')).toHaveTextContent('Uploading');
    resolveUpload({ success: true, data: record });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});

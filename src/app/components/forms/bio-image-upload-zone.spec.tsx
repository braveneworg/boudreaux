/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';

import { BioImageUploadZone, type BioImageUploadZoneProps } from './bio-image-upload-zone';

const record = { id: 'img-9', artistId: 'a1', url: 'https://cdn/x.webp' } as ArtistBioImageRecord;

const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

// The zone collects the fields and hands the file to the pool module's
// upload; the pipeline, the type check and the error copy live there.
const renderZone = (overrides: Partial<BioImageUploadZoneProps> = {}) => {
  const onUpload = vi.fn<BioImageUploadZoneProps['onUpload']>().mockResolvedValue(record);
  const props: BioImageUploadZoneProps = { onUpload, ...overrides };
  render(<BioImageUploadZone {...props} />);
  return { ...props, onUpload, input: screen.getByLabelText('Upload bio image') };
};

describe('BioImageUploadZone', () => {
  it('collects alt text and attribution before the file', () => {
    renderZone();
    expect(screen.getByLabelText('Alt text')).toBeInTheDocument();
    expect(screen.getByLabelText('Attribution (optional)')).toBeInTheDocument();
  });

  it("hints that blank alt text defaults to the artist's name while it is blank", async () => {
    renderZone();
    expect(screen.getByText(/Left blank, the artist's name is used/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Alt text'), 'Ceschi on stage');
    expect(screen.queryByText(/Left blank, the artist's name is used/)).not.toBeInTheDocument();
  });

  it('hands the file and the trimmed fields to the pool upload', async () => {
    const { onUpload, input } = renderZone();
    await userEvent.type(screen.getByLabelText('Alt text'), '  Ceschi on stage ');
    await userEvent.type(screen.getByLabelText('Attribution (optional)'), 'Photo by Sam ');
    await userEvent.upload(input, jpeg);

    await waitFor(() =>
      expect(onUpload).toHaveBeenCalledWith(jpeg, {
        attribution: 'Photo by Sam',
        alt: 'Ceschi on stage',
      })
    );
  });

  it('sends a null alt and an empty attribution when both are blank', async () => {
    const { onUpload, input } = renderZone();
    await userEvent.upload(input, jpeg);

    await waitFor(() =>
      expect(onUpload).toHaveBeenCalledWith(jpeg, { attribution: '', alt: null })
    );
  });

  it('clears the fields after a successful upload', async () => {
    const { input } = renderZone();
    await userEvent.type(screen.getByLabelText('Alt text'), 'Ceschi');
    await userEvent.upload(input, jpeg);

    await waitFor(() => expect(screen.getByLabelText('Alt text')).toHaveValue(''));
  });

  it('keeps the fields when the upload fails', async () => {
    const onUpload = vi.fn<BioImageUploadZoneProps['onUpload']>().mockResolvedValue(null);
    const { input } = renderZone({ onUpload });
    await userEvent.type(screen.getByLabelText('Alt text'), 'Ceschi');
    await userEvent.upload(input, jpeg);

    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    expect(screen.getByLabelText('Alt text')).toHaveValue('Ceschi');
  });

  it('shows the pool’s upload error inline', () => {
    renderZone({ errorMessage: 'S3 refused' });
    expect(screen.getByRole('alert')).toHaveTextContent('S3 refused');
  });

  it('accepts a dropped file through the drop zone', async () => {
    const { onUpload, input } = renderZone();
    const zone = input.parentElement as HTMLElement;
    fireEvent.dragOver(zone, { dataTransfer: { files: [jpeg] } });
    fireEvent.drop(zone, { dataTransfer: { files: [jpeg] } });

    await waitFor(() =>
      expect(onUpload).toHaveBeenCalledWith(jpeg, { attribution: '', alt: null })
    );
  });

  it('ignores a drop that carries no file', async () => {
    const { onUpload, input } = renderZone();
    const zone = input.parentElement as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [] } });

    await waitFor(() => expect(onUpload).not.toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('disables the inputs and the drop zone when disabled', () => {
    const { input } = renderZone({ disabled: true });
    expect(input).toBeDisabled();
    expect(screen.getByLabelText('Alt text')).toBeDisabled();
  });

  it('shows an uploading status and blocks a second file while the pool uploads', () => {
    const { input } = renderZone({ isUploading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Uploading');
    expect(input).toBeDisabled();
  });
});

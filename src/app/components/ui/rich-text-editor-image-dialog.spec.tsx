/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useState } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ImageDialog } from './rich-text-editor-image-dialog';

import type { RichTextEditorImage, RichTextEditorUploadHandler } from './rich-text-editor';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="picker-image" data-src={src} data-alt={alt} />
  ),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

const IMAGES: RichTextEditorImage[] = [
  { url: 'https://cdn.example.com/bio/0.jpg', alt: 'Portrait', width: 800, height: 600 },
];

const UPLOADED: RichTextEditorImage = {
  url: 'https://cdn.example.com/bio/uploaded.jpg',
  alt: null,
  width: 1024,
  height: 768,
};

interface HarnessProps {
  onUploadImage?: RichTextEditorUploadHandler;
  onInsertImage?: (image: RichTextEditorImage) => void;
  images?: RichTextEditorImage[];
}

const Harness = ({ onUploadImage, onInsertImage = vi.fn(), images = IMAGES }: HarnessProps) => {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [attribution, setAttribution] = useState('');
  return (
    <ImageDialog
      open
      onOpenChange={() => {}}
      images={images}
      imageTitle={title}
      imageSubtitle={subtitle}
      imageAttribution={attribution}
      onImageTitleChange={setTitle}
      onImageSubtitleChange={setSubtitle}
      onImageAttributionChange={setAttribution}
      onInsertImage={onInsertImage}
      onUploadImage={onUploadImage}
    />
  );
};

const makeFile = (): File => new File(['x'], 'photo.png', { type: 'image/png' });

const chooseFile = (file: File): void => {
  fireEvent.change(screen.getByLabelText<HTMLInputElement>('Upload image file'), {
    target: { files: [file] },
  });
};

describe('ImageDialog', () => {
  it('renders no Upload tab when no upload handler is provided', () => {
    render(<Harness />);

    expect(screen.queryByRole('tab', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('renders the library grid when no upload handler is provided', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Insert Portrait' })).toBeInTheDocument();
  });

  it('enables Upload & insert once a file is chosen and attribution entered', async () => {
    render(<Harness onUploadImage={vi.fn(async () => UPLOADED)} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    chooseFile(makeFile());
    await userEvent.type(screen.getByRole('textbox', { name: 'Attribution' }), 'Jane Doe');

    expect(screen.getByRole('button', { name: 'Upload & insert' })).toBeEnabled();
  });

  it('enables Upload & insert when a file is dropped onto the drop zone', async () => {
    const file = makeFile();
    render(<Harness onUploadImage={vi.fn(async () => UPLOADED)} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    const dropZone = screen
      .getByLabelText<HTMLInputElement>('Upload image file')
      .closest('div') as HTMLElement;
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    await userEvent.type(screen.getByRole('textbox', { name: 'Attribution' }), 'Jane Doe');

    expect(screen.getByRole('button', { name: 'Upload & insert' })).toBeEnabled();
  });

  it('uploads the file with the typed attribution metadata', async () => {
    const file = makeFile();
    const onUploadImage = vi.fn(async () => UPLOADED);
    render(<Harness onUploadImage={onUploadImage} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    chooseFile(file);
    await userEvent.type(screen.getByRole('textbox', { name: 'Attribution' }), 'Jane Doe');
    await userEvent.click(screen.getByRole('button', { name: 'Upload & insert' }));

    await waitFor(() =>
      expect(onUploadImage).toHaveBeenCalledWith(file, {
        attribution: 'Jane Doe',
        title: null,
        subtitle: null,
      })
    );
  });

  it('inserts the resolved image after a successful upload', async () => {
    const onInsertImage = vi.fn();
    render(<Harness onUploadImage={vi.fn(async () => UPLOADED)} onInsertImage={onInsertImage} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    chooseFile(makeFile());
    await userEvent.type(screen.getByRole('textbox', { name: 'Attribution' }), 'Jane Doe');
    await userEvent.click(screen.getByRole('button', { name: 'Upload & insert' }));

    await waitFor(() => expect(onInsertImage).toHaveBeenCalledWith(UPLOADED));
  });

  it('keeps Upload & insert disabled while attribution is empty', async () => {
    render(<Harness onUploadImage={vi.fn(async () => UPLOADED)} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    chooseFile(makeFile());

    expect(screen.getByRole('button', { name: 'Upload & insert' })).toBeDisabled();
  });

  it('does not insert when the upload resolves null', async () => {
    const onUploadImage = vi.fn(async () => null);
    const onInsertImage = vi.fn();
    render(<Harness onUploadImage={onUploadImage} onInsertImage={onInsertImage} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    chooseFile(makeFile());
    await userEvent.type(screen.getByRole('textbox', { name: 'Attribution' }), 'Jane Doe');
    await userEvent.click(screen.getByRole('button', { name: 'Upload & insert' }));

    await waitFor(() => expect(onUploadImage).toHaveBeenCalled());
    expect(onInsertImage).not.toHaveBeenCalled();
  });

  it('leaves the upload panel mounted when the upload resolves null', async () => {
    render(<Harness onUploadImage={vi.fn(async () => null)} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    chooseFile(makeFile());
    await userEvent.type(screen.getByRole('textbox', { name: 'Attribution' }), 'Jane Doe');
    await userEvent.click(screen.getByRole('button', { name: 'Upload & insert' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Upload & insert' })).toBeEnabled()
    );
  });
});

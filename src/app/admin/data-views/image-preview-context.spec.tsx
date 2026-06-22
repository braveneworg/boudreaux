/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ImagePreviewProvider, useImagePreview } from './image-preview-context';

const OpenButton = ({ src, altText }: { src: string; altText?: string }) => {
  const { openPreview } = useImagePreview();
  return (
    <button type="button" onClick={() => openPreview({ src, altText })}>
      open
    </button>
  );
};

describe('useImagePreview', () => {
  it('throws when used outside an ImagePreviewProvider', () => {
    expect(() => render(<OpenButton src="https://cdn.example.com/a.jpg" />)).toThrow(
      'useImagePreview must be used within an ImagePreviewProvider'
    );
  });
});

describe('ImagePreviewProvider', () => {
  it('does not render the preview dialog until an image is opened', () => {
    render(
      <ImagePreviewProvider>
        <OpenButton src="https://cdn.example.com/a.jpg" altText="Cover art" />
      </ImagePreviewProvider>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the preview dialog with the requested image when triggered', async () => {
    const user = userEvent.setup();
    render(
      <ImagePreviewProvider>
        <OpenButton src="https://cdn.example.com/a.jpg" altText="Cover art" />
      </ImagePreviewProvider>
    );

    await user.click(screen.getByRole('button', { name: 'open' }));

    expect(screen.getByRole('img', { name: 'Cover art' })).toBeInTheDocument();
  });
});

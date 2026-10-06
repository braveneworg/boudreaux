/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DisplayImageGallery, type GalleryImage } from './display-image-gallery';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="next-image" data-src={src} data-alt={alt} />
  ),
}));

const image = (n: number, extra: Partial<GalleryImage> = {}): GalleryImage => ({
  id: `img-${n}`,
  url: `https://cdn.example/${n}.jpg`,
  thumbnailUrl: null,
  alt: `Photo ${n}`,
  title: null,
  attribution: null,
  license: null,
  sourceUrl: null,
  width: null,
  height: null,
  ...extra,
});

const IMAGES = Array.from({ length: 9 }, (_, n) => image(n + 1));

const renderGallery = (index = 2, images = IMAGES) => {
  const onIndexChange = vi.fn();
  const { unmount } = render(
    <DisplayImageGallery
      images={images}
      index={index}
      onIndexChange={onIndexChange}
      displayName="Test Artist"
    />
  );
  return { onIndexChange, unmount, user: userEvent.setup({ delay: null }) };
};

describe('DisplayImageGallery', () => {
  it('shows the image at the index and says where it is in the set', () => {
    renderGallery(2);

    expect(screen.getByTestId('next-image')).toHaveAttribute('data-alt', 'Photo 3');
    expect(screen.getByText('3 of 9')).toHaveAttribute('aria-live', 'polite');
  });

  it('steps to the next image', async () => {
    const { onIndexChange, user } = renderGallery(2);

    await user.click(screen.getByRole('button', { name: 'Next image' }));

    expect(onIndexChange.mock.calls).toEqual([[3]]);
  });

  it('wraps from the last image to the first and from the first to the last', async () => {
    const last = renderGallery(8);
    await last.user.click(screen.getByRole('button', { name: 'Next image' }));
    expect(last.onIndexChange.mock.calls).toEqual([[0]]);
  });

  it('wraps backwards from the first image', async () => {
    const { onIndexChange, user } = renderGallery(0);

    await user.click(screen.getByRole('button', { name: 'Previous image' }));

    expect(onIndexChange.mock.calls).toEqual([[8]]);
  });

  it('steps with the arrow keys', () => {
    const { onIndexChange } = renderGallery(2);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    expect(onIndexChange.mock.calls).toEqual([[3], [1]]);
  });

  it('ignores an arrow key with a modifier held', () => {
    const { onIndexChange } = renderGallery(2);

    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true });
    fireEvent.keyDown(window, { key: 'ArrowLeft', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('ignores an arrow key typed into an editable element', () => {
    const { onIndexChange } = renderGallery(2);
    const input = document.createElement('input');
    document.body.append(input);

    fireEvent.keyDown(input, { key: 'ArrowRight' });

    expect(onIndexChange).not.toHaveBeenCalled();
    input.remove();
  });

  it('stops listening once unmounted', () => {
    const { onIndexChange, unmount } = renderGallery(2);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    unmount();

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(onIndexChange.mock.calls).toEqual([[3]]);
  });

  it('shows the image credit under it', () => {
    renderGallery(0, [image(1, { title: 'On stage', attribution: 'Jane', license: 'CC BY' })]);

    expect(screen.getByText('On stage')).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
  });

  it('hides the step controls for a single image', () => {
    renderGallery(0, [image(1)]);

    expect(screen.queryByRole('button', { name: 'Next image' })).not.toBeInTheDocument();
    expect(screen.queryByText('1 of 1')).not.toBeInTheDocument();
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExpandableThumbnail } from './expandable-thumbnail';

const useIsMobileMock = vi.hoisted(() => vi.fn<() => boolean>());

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => useIsMobileMock(),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <span data-testid="next-image" data-src={src} data-alt={alt} className={className} />
  ),
}));

describe('ExpandableThumbnail', () => {
  beforeEach(() => {
    useIsMobileMock.mockReturnValue(false);
  });

  it('never zooms from CSS hover, which fires as the page scrolls past', () => {
    const { container } = render(<ExpandableThumbnail src="https://x/a.jpg" alt="portrait" />);

    expect(container.innerHTML).not.toMatch(/(^|[\s"])(group-)?hover:/);
  });

  it('zooms once the mouse really moves onto the thumbnail', () => {
    render(<ExpandableThumbnail src="https://x/a.jpg" alt="portrait" />);
    const trigger = screen.getByRole('button', { name: 'Expand image: portrait' });

    fireEvent.pointerMove(trigger, { clientX: 3, clientY: 3, pointerType: 'mouse' });

    expect(trigger).toHaveAttribute('data-hovered');
    expect(screen.getByTestId('next-image')).toHaveClass('group-data-[hovered]:scale-110');
  });

  it('shows a zoom-in cursor on the thumbnail', () => {
    render(<ExpandableThumbnail src="https://x/a.jpg" alt="portrait" />);

    expect(screen.getByRole('button', { name: 'Expand image: portrait' })).toHaveClass(
      'cursor-zoom-in'
    );
  });

  it('opens a dialog on a wide viewport', async () => {
    render(<ExpandableThumbnail src="https://x/a.jpg" alt="portrait" />);

    await userEvent.click(screen.getByRole('button', { name: 'Expand image: portrait' }));

    expect(screen.getByRole('dialog')).toHaveAttribute('data-slot', 'dialog-content');
  });

  it('opens a bottom drawer on a narrow viewport', async () => {
    useIsMobileMock.mockReturnValue(true);
    render(<ExpandableThumbnail src="https://x/a.jpg" alt="portrait" />);

    await userEvent.click(screen.getByRole('button', { name: 'Expand image: portrait' }));

    expect(screen.getByRole('dialog')).toHaveAttribute('data-vaul-drawer-direction', 'bottom');
  });

  it('fits the whole enlarged image inside a height cap', async () => {
    render(
      <ExpandableThumbnail src="https://x/full.jpg" thumbnailSrc="https://x/t.jpg" alt="portrait" />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Expand image: portrait' }));

    const enlarged = screen
      .getAllByTestId('next-image')
      .find((image) => image.getAttribute('data-src') === 'https://x/full.jpg');
    expect(enlarged).toHaveClass('object-contain', 'max-h-[60dvh]', 'md:max-h-[75vh]');
  });
  it('renders an expand trigger labelled with the alt text', () => {
    render(<ExpandableThumbnail src="https://x/a.jpg" alt="Artist portrait" />);

    expect(
      screen.getByRole('button', { name: 'Expand image: Artist portrait' })
    ).toBeInTheDocument();
  });

  it('frames the thumbnail trigger with a square black border', () => {
    render(<ExpandableThumbnail src="https://x/a.jpg" alt="Artist portrait" />);

    const trigger = screen.getByRole('button', { name: 'Expand image: Artist portrait' });
    expect(trigger).toHaveClass('border-2', 'border-black');
    expect(trigger).not.toHaveClass('rounded-lg');
  });

  it('drops the resting ring but keeps the focus-visible ring', () => {
    render(<ExpandableThumbnail src="https://x/a.jpg" alt="Artist portrait" />);

    const trigger = screen.getByRole('button', { name: 'Expand image: Artist portrait' });
    expect(trigger).not.toHaveClass('ring-1');
    expect(trigger).not.toHaveClass('ring-border');
    expect(trigger).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-primary');
  });

  it('uses the thumbnail source for the collapsed image when provided', () => {
    render(
      <ExpandableThumbnail
        src="https://x/full.jpg"
        thumbnailSrc="https://x/thumb.jpg"
        alt="portrait"
      />
    );

    expect(screen.getByTestId('next-image')).toHaveAttribute('data-src', 'https://x/thumb.jpg');
  });

  it('shows attribution, license, and a nofollow source link when expanded', async () => {
    render(
      <ExpandableThumbnail
        src="https://x/a.jpg"
        alt="portrait"
        attribution="Jane Photog"
        license="CC BY-SA 4.0"
        sourceUrl="https://commons.wikimedia.org/wiki/File:a.jpg"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /expand image/i }));

    expect(screen.getByText('Jane Photog')).toBeInTheDocument();
    expect(screen.getByText(/CC BY-SA 4\.0/)).toBeInTheDocument();
    const sourceLink = screen.getByRole('link', { name: 'source' });
    expect(sourceLink).toHaveAttribute('rel', 'nofollow noopener noreferrer');
    expect(sourceLink).toHaveAttribute('target', '_blank');
  });
});

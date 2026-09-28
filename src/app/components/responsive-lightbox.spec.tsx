/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  LIGHTBOX_ZOOM_CLASS,
  LightboxImage,
  LightboxTrigger,
  ResponsiveLightbox,
} from './responsive-lightbox';

const useIsMobileMock = vi.hoisted(() => vi.fn<() => boolean>());

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => useIsMobileMock(),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <span data-testid="next-image" data-src={src} data-alt={alt} className={className} />
  ),
}));

const renderLightbox = (): void => {
  render(
    <ResponsiveLightbox
      trigger={<LightboxTrigger label="Expand image: Portrait">thumb</LightboxTrigger>}
      title="Test Artist"
      description="A portrait of the artist"
    >
      <p>Lightbox body</p>
    </ResponsiveLightbox>
  );
};

const trigger = (): HTMLElement => screen.getByRole('button', { name: 'Expand image: Portrait' });

describe('ResponsiveLightbox', () => {
  beforeEach(() => {
    useIsMobileMock.mockReturnValue(false);
  });

  it('stays closed until the trigger is used', () => {
    renderLightbox();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a centred dialog on a wide viewport', async () => {
    renderLightbox();

    await userEvent.click(trigger());

    expect(screen.getByRole('dialog')).toHaveAttribute('data-slot', 'dialog-content');
  });

  it('opens a bottom drawer on a narrow viewport', async () => {
    useIsMobileMock.mockReturnValue(true);
    renderLightbox();

    await userEvent.click(trigger());

    expect(screen.getByRole('dialog')).toHaveAttribute('data-vaul-drawer-direction', 'bottom');
  });

  it.each([
    ['dialog', false],
    ['drawer', true],
  ])('names the %s with the title', async (_surface, isMobile) => {
    useIsMobileMock.mockReturnValue(isMobile);
    renderLightbox();

    await userEvent.click(trigger());

    expect(screen.getByRole('dialog', { name: 'Test Artist' })).toBeInTheDocument();
  });

  it.each([
    ['dialog', false],
    ['drawer', true],
  ])('describes the %s and renders the body', async (_surface, isMobile) => {
    useIsMobileMock.mockReturnValue(isMobile);
    renderLightbox();

    await userEvent.click(trigger());

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('A portrait of the artist');
    expect(screen.getByText('Lightbox body')).toBeInTheDocument();
  });

  it.each([
    ['dialog', false],
    ['drawer', true],
  ])('offers a close control in the %s', async (_surface, isMobile) => {
    useIsMobileMock.mockReturnValue(isMobile);
    renderLightbox();
    await userEvent.click(trigger());

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    // The drawer keeps its content mounted while it slides out, so read the
    // open state off the trigger rather than waiting on the unmount.
    expect(
      screen.getByRole('button', { name: 'Expand image: Portrait', hidden: true })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens from the keyboard', async () => {
    renderLightbox();

    trigger().focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the body root shrinkable so wide content cannot widen the dialog', async () => {
    renderLightbox();

    await userEvent.click(trigger());

    expect(screen.getByText('Lightbox body').parentElement).toHaveClass('min-w-0');
  });
});

describe('LightboxTrigger', () => {
  it('shows a zoom-in cursor', () => {
    render(<LightboxTrigger label="Expand image: Portrait">thumb</LightboxTrigger>);

    expect(trigger()).toHaveClass('cursor-zoom-in');
  });

  it('is not marked hovered at rest', () => {
    render(<LightboxTrigger label="Expand image: Portrait">thumb</LightboxTrigger>);

    expect(trigger()).not.toHaveAttribute('data-hovered');
  });

  it('is marked hovered once the mouse moves over it', () => {
    render(<LightboxTrigger label="Expand image: Portrait">thumb</LightboxTrigger>);

    fireEvent.pointerMove(trigger(), { clientX: 5, clientY: 5, pointerType: 'mouse' });

    expect(trigger()).toHaveAttribute('data-hovered');
  });

  it('never styles itself from CSS hover, which fires while the page scrolls', () => {
    const { container } = render(
      <LightboxTrigger label="Expand image: Portrait">thumb</LightboxTrigger>
    );

    expect(container.innerHTML).not.toMatch(/(^|[\s"])(group-)?hover:/);
  });

  it('merges a caller class onto the button', () => {
    render(
      <LightboxTrigger label="Expand image: Portrait" className="size-32">
        thumb
      </LightboxTrigger>
    );

    expect(trigger()).toHaveClass('size-32', 'border-2', 'border-black');
  });
});

describe('LIGHTBOX_ZOOM_CLASS', () => {
  it('zooms on pointer hover and keyboard focus only', () => {
    expect(LIGHTBOX_ZOOM_CLASS.split(' ')).toEqual(
      expect.arrayContaining(['group-data-[hovered]:scale-110', 'group-focus-visible:scale-110'])
    );
    expect(LIGHTBOX_ZOOM_CLASS).not.toMatch(/(^|\s)(group-)?hover:/);
  });

  it('cancels the zoom for readers who asked for reduced motion', () => {
    expect(LIGHTBOX_ZOOM_CLASS.split(' ')).toEqual(
      expect.arrayContaining([
        'motion-reduce:transition-none',
        'motion-reduce:group-data-[hovered]:scale-100',
        'motion-reduce:group-focus-visible:scale-100',
      ])
    );
  });
});

describe('LightboxImage', () => {
  it('fits the whole image inside a height cap', () => {
    render(<LightboxImage src="https://x/a.jpg" alt="Portrait" />);

    expect(screen.getByTestId('next-image')).toHaveClass(
      'w-full',
      'object-contain',
      'max-h-[60dvh]',
      'md:max-h-[75vh]'
    );
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ComponentProps } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VideoPlayDialog } from './video-play-dialog';

interface SurfaceProps {
  title: string;
  src: string;
  posterUrl?: string | null;
  onEnterPictureInPicture?: () => void;
  onLeavePictureInPicture?: (isPaused: boolean) => void;
  takeMediaEl?: () => HTMLVideoElement | null;
}

// Sentinel surface: proves the modal mounts the lazy player with the right
// handoff without pulling video.js into the module graph. It records its
// mounts and unmounts, since an unmount is what disposes the real player.
const surfaceProps = vi.hoisted(
  (): Partial<SurfaceProps> & { mounts: number; unmounts: number } => ({
    mounts: 0,
    unmounts: 0,
  })
);
vi.mock('./lazy-video-surface', async () => {
  const { createElement, useEffect } = await import('react');
  return {
    LazyVideoSurface: (props: SurfaceProps) => {
      surfaceProps.src = props.src;
      surfaceProps.posterUrl = props.posterUrl;
      surfaceProps.takeMediaEl = props.takeMediaEl;
      surfaceProps.onEnterPictureInPicture = props.onEnterPictureInPicture;
      surfaceProps.onLeavePictureInPicture = props.onLeavePictureInPicture;
      useEffect(() => {
        surfaceProps.mounts += 1;
        return () => {
          surfaceProps.unmounts += 1;
        };
      }, []);
      return createElement('div', { 'data-testid': 'video-surface' }, `surface:${props.title}`);
    },
  };
});

beforeEach(() => {
  surfaceProps.mounts = 0;
  surfaceProps.unmounts = 0;
});

const takeMediaEl = (): HTMLVideoElement | null => null;

/** The open dialog's markup before the home search props existed, ids normalised. */
const UNCHANGED_DIALOG_HTML = `<div role="dialog" id="ID" data-state="open" data-slot="dialog-content" class="bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 shadow-zine-ink fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-none border-2 border-black duration-200 gap-3 p-4 sm:max-w-3xl lg:max-w-5xl" tabindex="-1" aria-describedby="ID" aria-labelledby="ID" style="pointer-events: auto;"><div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left pr-8"><h2 id="ID" data-slot="dialog-title" class="font-fake-four-cutout text-xl font-normal break-words text-zinc-950 sm:text-2xl">Live at the Basement</h2><div data-slot="dialog-description" class="text-sm text-zinc-600" id="ID">The Band</div></div><div><div><div data-testid="video-surface">surface:Live at the Basement</div></div></div><button type="button" data-slot="dialog-close" class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent absolute top-4 right-4 opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:text-zinc-950 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg><span class="sr-only">Close</span></button></div>`;

const CLIP_SRC = 'https://cdn.example.com/clip.mp4';

const dialogElement = (open: boolean, onOpenChange = vi.fn(), src = CLIP_SRC) => (
  <VideoPlayDialog
    title="Live at the Basement"
    artist="The Band"
    src={src}
    open={open}
    onOpenChange={onOpenChange}
    takeMediaEl={takeMediaEl}
  />
);

const renderDialog = (open: boolean, onOpenChange = vi.fn()) => {
  render(dialogElement(open, onOpenChange));
  return onOpenChange;
};

const enterPictureInPicture = (): void => act(() => surfaceProps.onEnterPictureInPicture?.());

// "Back to tab" leaves the video playing; closing the floating window pauses it.
const leavePictureInPicture = (isPaused = false): void =>
  act(() => surfaceProps.onLeavePictureInPicture?.(isPaused));

describe('VideoPlayDialog', () => {
  it('renders nothing while closed', () => {
    renderDialog(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not mount the player surface while closed', () => {
    renderDialog(false);

    expect(screen.queryByTestId('video-surface')).not.toBeInTheDocument();
  });

  it('opens a dialog titled with the video title', () => {
    renderDialog(true);

    expect(screen.getByRole('dialog', { name: 'Live at the Basement' })).toBeInTheDocument();
  });

  it('shows the artist under the title', () => {
    renderDialog(true);

    expect(screen.getByText('The Band')).toBeInTheDocument();
  });

  it('mounts the player surface immediately when open', () => {
    renderDialog(true);

    expect(screen.getByTestId('video-surface')).toBeInTheDocument();
  });

  it('hands the surface the stream url and never a poster', () => {
    renderDialog(true);

    // The modal must show only the playing video — no poster image may ever
    // overlay it, not even as video.js's loading placeholder.
    expect(surfaceProps.src).toBe('https://cdn.example.com/clip.mp4');
    expect(surfaceProps.posterUrl).toBeUndefined();
  });

  it('forwards the one-shot primed-element supplier to the surface', () => {
    renderDialog(true);

    expect(surfaceProps.takeMediaEl).toBe(takeMediaEl);
  });

  it('requests close via onOpenChange from the close button', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderDialog(true);

    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it('does not request close when the player surface is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderDialog(true);
    // Radix starts listening for outside pointer-downs a macrotask after open.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    await user.click(screen.getByTestId('video-surface'));

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // While the player is in picture-in-picture the modal hides and leaves the
  // page fully usable, but the surface (and so the player and its playing
  // <video>) stays mounted; leaving picture-in-picture shows it again.
  // `/videos` passes none of the home-search props; its modal must not change.
  it('renders the same markup as before when given none of the optional props', () => {
    renderDialog(true);

    expect(screen.getByRole('dialog').outerHTML.replace(/radix-[^"]+/g, 'ID')).toBe(
      UNCHANGED_DIALOG_HTML
    );
  });

  describe('home search props', () => {
    const renderWith = (props: Partial<ComponentProps<typeof VideoPlayDialog>>) =>
      render(
        <VideoPlayDialog
          title="Live at the Basement"
          artist="The Band"
          src={CLIP_SRC}
          open
          onOpenChange={vi.fn()}
          takeMediaEl={takeMediaEl}
          {...props}
        />
      );

    it('leads with the artist, linked, over the title and year when asked', () => {
      renderWith({ headingOrder: 'artist-first', artistHref: '/artists/the-band', year: 2025 });

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAccessibleName('The Band');
      expect(dialog).toHaveAccessibleDescription('Live at the Basement (2025)');
      expect(screen.getByRole('link', { name: 'The Band' })).toHaveAttribute(
        'href',
        '/artists/the-band'
      );
    });

    it('centers the heading lines when asked', () => {
      renderWith({ headingOrder: 'artist-first', centered: true });

      expect(screen.getByRole('heading', { name: 'The Band' })).toHaveClass('text-center');
    });

    it('takes the accent on the dialog', () => {
      renderWith({ accent: 'orchid' });

      expect(screen.getByRole('dialog')).toHaveClass('zine-accent-orchid');
    });

    // The accent shows as the player frame's offset shadow, as it does on the
    // release player's frame.
    it('frames the player in the accent when given one', () => {
      renderWith({ accent: 'orchid' });

      const slot = screen.getByTestId('video-surface').parentElement?.parentElement;
      expect(slot).toHaveClass('border-2', 'border-black', 'shadow-zine');
    });

    it('renders a footer after the player, shrinkable inside the dialog grid', () => {
      renderWith({ footer: <a href="/videos?artist=the-band">View all videos</a> });

      const footer = screen.getByRole('link', { name: 'View all videos' }).parentElement;
      expect(footer).toHaveAttribute('data-slot', 'video-play-dialog-footer');
      expect(footer).toHaveClass('min-w-0', 'text-sm');
      expect(
        screen.getByTestId('video-surface').compareDocumentPosition(footer as HTMLElement) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it('renders an action in the heading', () => {
      renderWith({ action: <button type="button">More options</button> });

      expect(document.querySelector('[data-slot="dialog-header"]')).toContainElement(
        screen.getByRole('button', { name: 'More options' })
      );
    });

    it('lets the opener decide where focus returns on close', async () => {
      const onCloseAutoFocus = vi.fn();
      const { rerender } = renderWith({ onCloseAutoFocus });

      rerender(
        <VideoPlayDialog
          title="Live at the Basement"
          artist="The Band"
          src={CLIP_SRC}
          open={false}
          onOpenChange={vi.fn()}
          takeMediaEl={takeMediaEl}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      );

      await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
    });

    // Videos fail closed: without a signed stream URL there is nothing to play.
    it('says the video cannot be played, and mounts no player, without a source', () => {
      renderWith({ src: null });

      expect(screen.getByRole('alert')).toHaveTextContent('This video can’t be played right now.');
      expect(screen.queryByTestId('video-surface')).not.toBeInTheDocument();
    });
  });

  describe('picture-in-picture', () => {
    it('hides the dialog when the player enters picture-in-picture', () => {
      renderDialog(true);

      enterPictureInPicture();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('keeps the same surface mounted while hidden', () => {
      renderDialog(true);
      const surface = screen.getByTestId('video-surface');

      enterPictureInPicture();

      expect(screen.getByTestId('video-surface')).toBe(surface);
      expect(surface).toBeInTheDocument();
      expect(surfaceProps.unmounts).toBe(0);
    });

    it('takes the surface out of the accessibility tree while hidden', () => {
      renderDialog(true);

      enterPictureInPicture();

      expect(screen.queryByText('surface:Live at the Basement')).not.toBeVisible();
    });

    it('leaves the page behind neither aria-hidden nor locked while hidden', () => {
      render(
        <>
          <button type="button">Page behind</button>
          {dialogElement(true)}
        </>
      );

      enterPictureInPicture();

      expect(document.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
      expect(document.querySelectorAll('[inert]')).toHaveLength(0);
      expect(document.body.style.pointerEvents).toBe('');
      expect(document.body).not.toHaveAttribute('data-scroll-locked');
      expect(screen.getByRole('button', { name: 'Page behind' })).toBeVisible();
    });

    it('never requests a close on entering picture-in-picture or going back to the tab', () => {
      const onOpenChange = renderDialog(true);

      enterPictureInPicture();
      leavePictureInPicture();

      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('shows the dialog again when the player leaves picture-in-picture', () => {
      renderDialog(true);

      enterPictureInPicture();
      leavePictureInPicture();

      expect(screen.getByRole('dialog', { name: 'Live at the Basement' })).toBeInTheDocument();
    });

    it('shows the same surface again without ever unmounting it', () => {
      renderDialog(true);
      const surface = screen.getByTestId('video-surface');

      enterPictureInPicture();
      leavePictureInPicture();

      const dialog = screen.getByRole('dialog', { name: 'Live at the Basement' });
      expect(dialog).toContainElement(surface);
      expect([surfaceProps.mounts, surfaceProps.unmounts]).toEqual([1, 0]);
    });

    it('shows the dialog for a new source picked while hidden', () => {
      const { rerender } = render(dialogElement(true));

      enterPictureInPicture();
      rerender(dialogElement(true, vi.fn(), 'https://cdn.example.com/other.mp4'));

      expect(screen.getByRole('dialog', { name: 'Live at the Basement' })).toBeInTheDocument();
    });

    it('opens visible again after closing and reopening on the same source', () => {
      const { rerender } = render(dialogElement(true));

      enterPictureInPicture();
      rerender(dialogElement(false));
      rerender(dialogElement(true));

      expect(screen.getByRole('dialog', { name: 'Live at the Basement' })).toBeInTheDocument();
    });

    it('requests a close when picture-in-picture is left paused', () => {
      const onOpenChange = renderDialog(true);

      enterPictureInPicture();
      leavePictureInPicture(true);

      expect(onOpenChange.mock.calls).toEqual([[false]]);
    });

    it('stays hidden when picture-in-picture is left paused', () => {
      renderDialog(true);

      enterPictureInPicture();
      leavePictureInPicture(true);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('unmounts the surface once the close requested on a paused leave lands', () => {
      const { rerender } = render(dialogElement(true));

      enterPictureInPicture();
      leavePictureInPicture(true);
      rerender(dialogElement(false));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('video-surface')).not.toBeInTheDocument();
      expect(surfaceProps.unmounts).toBe(1);
    });

    it('still unmounts the surface when the shown dialog is closed', () => {
      const { rerender } = render(dialogElement(true));

      enterPictureInPicture();
      leavePictureInPicture();
      rerender(dialogElement(false));

      expect(screen.queryByTestId('video-surface')).not.toBeInTheDocument();
      expect(surfaceProps.unmounts).toBe(1);
    });
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VideoPlayDialog } from './video-play-dialog';

interface SurfaceProps {
  title: string;
  src: string;
  posterUrl?: string | null;
  onEnterPictureInPicture?: () => void;
  onLeavePictureInPicture?: () => void;
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

const leavePictureInPicture = (): void => act(() => surfaceProps.onLeavePictureInPicture?.());

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

    it('never requests a close on entering or leaving picture-in-picture', () => {
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

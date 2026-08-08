/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VideoPlayDialog } from './video-play-dialog';

// Sentinel surface: proves the modal mounts the lazy player with the right
// handoff without pulling video.js into the module graph.
const surfaceProps = vi.hoisted(
  (): {
    src?: string;
    posterUrl?: string | null;
    takeMediaEl?: () => HTMLVideoElement | null;
  } => ({})
);
vi.mock('./lazy-video-surface', () => ({
  LazyVideoSurface: (props: {
    title: string;
    src: string;
    posterUrl?: string | null;
    takeMediaEl?: () => HTMLVideoElement | null;
  }) => {
    surfaceProps.src = props.src;
    surfaceProps.posterUrl = props.posterUrl;
    surfaceProps.takeMediaEl = props.takeMediaEl;
    return createElement('div', { 'data-testid': 'video-surface' }, `surface:${props.title}`);
  },
}));

const takeMediaEl = (): HTMLVideoElement | null => null;

const renderDialog = (open: boolean, onOpenChange = vi.fn()) => {
  render(
    <VideoPlayDialog
      title="Live at the Basement"
      artist="The Band"
      src="https://cdn.example.com/clip.mp4"
      open={open}
      onOpenChange={onOpenChange}
      takeMediaEl={takeMediaEl}
    />
  );
  return onOpenChange;
};

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
});

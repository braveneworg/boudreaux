/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import type { AttachmentView } from '@/lib/types/domain/submission-attachment';

import { SubmissionAttachmentGallery } from './submission-attachment-gallery';

// The player is a poster facade over video.js, covered by its own spec.
vi.mock('@/app/components/ui/video/video-player', () => ({
  VideoPlayer: ({
    title,
    src,
    posterUrl,
  }: {
    title: string;
    src: string | null;
    posterUrl?: string | null;
  }) => (
    <div data-testid="video-player" data-title={title} data-src={src} data-poster={posterUrl} />
  ),
}));

const attachment = (overrides: Partial<AttachmentView> = {}): AttachmentView => ({
  id: 'e'.repeat(24),
  kind: 'IMAGE',
  fileName: 'show.jpg',
  state: 'ready',
  error: null,
  progress: null,
  url: 'https://cdn.example/media/submissions/s/a/copy.jpg',
  cardUrl: 'https://cdn.example/media/submissions/s/a/card.webp',
  posterUrl: null,
  width: 1200,
  height: 800,
  durationSeconds: null,
  ...overrides,
});

const video = attachment({
  id: '1'.repeat(24),
  kind: 'VIDEO',
  fileName: 'clip.mov',
  url: 'https://cdn.example/media/submissions/s/v/copy.mp4',
  posterUrl: 'https://cdn.example/media/submissions/s/v/poster.jpg',
  width: 1280,
  height: 720,
  durationSeconds: 42,
});

const audio = attachment({
  id: '2'.repeat(24),
  kind: 'AUDIO',
  fileName: 'take.wav',
  url: 'https://cdn.example/media/submissions/s/u/copy.mp3',
  cardUrl: null,
  width: null,
  height: null,
  durationSeconds: 90,
});

const renderGallery = (attachments: AttachmentView[]) =>
  render(<SubmissionAttachmentGallery attachments={attachments} title="The show" />);

describe('SubmissionAttachmentGallery', () => {
  it('renders nothing for a submission without attachments', () => {
    const { container } = renderGallery([]);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists the attachments in the order given', () => {
    renderGallery([video, attachment(), audio]);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('list', { name: 'Attachments' })).toBeInTheDocument();
  });

  it('shows a photo at its own size, named by the submission and its place', () => {
    renderGallery([attachment(), video]);

    const photo = screen.getByRole('img', { name: 'The show, attachment 1 of 2' });
    expect(photo).toHaveAttribute('width', '1200');
    expect(photo).toHaveAttribute('height', '800');
  });

  it('serves a photo as the one file the re-encode wrote', () => {
    renderGallery([attachment()]);

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example/media/submissions/s/a/copy.jpg'
    );
  });

  it('plays a video in the site’s player, from its copy and behind its poster', () => {
    renderGallery([video]);

    const player = screen.getByTestId('video-player');
    expect(player).toHaveAttribute('data-title', 'The show, attachment 1 of 1');
    expect(player).toHaveAttribute(
      'data-src',
      'https://cdn.example/media/submissions/s/v/copy.mp4'
    );
    expect(player).toHaveAttribute(
      'data-poster',
      'https://cdn.example/media/submissions/s/v/poster.jpg'
    );
  });

  it('plays audio from its copy, loading nothing until asked', () => {
    renderGallery([audio]);

    const player = screen.getByLabelText('The show, attachment 1 of 1');
    expect(player.tagName).toBe('AUDIO');
    expect(player).toHaveAttribute('src', 'https://cdn.example/media/submissions/s/u/copy.mp3');
    expect(player).toHaveAttribute('preload', 'none');
  });

  it('says an attachment is still processing, by its file name', () => {
    renderGallery([attachment({ state: 'processing', url: null, cardUrl: null })]);

    expect(screen.getByText('show.jpg is still processing.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('says why an attachment failed, by its file name', () => {
    renderGallery([
      attachment({
        state: 'failed',
        url: null,
        cardUrl: null,
        error: "We couldn't read this file. It may be damaged.",
      }),
    ]);

    expect(
      screen.getByText("show.jpg: We couldn't read this file. It may be damaged.")
    ).toBeInTheDocument();
  });
});

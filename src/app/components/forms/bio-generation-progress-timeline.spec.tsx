/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { BIO_PROGRESS_STAGES } from '@/lib/validation/bio-generation-schema';
import type { BioProgress } from '@/lib/validation/bio-generation-schema';

import { BioGenerationProgressTimeline } from './bio-generation-progress-timeline';

const AT = '2026-07-08T00:00:00.000Z';

const progressAt = (stage: BioProgress['stage'], counts?: BioProgress['counts']): BioProgress => ({
  stage,
  counts,
  at: AT,
});

describe('BioGenerationProgressTimeline', () => {
  it('renders all eleven stages in schema order', () => {
    render(<BioGenerationProgressTimeline progress={progressAt('musicbrainz')} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(BIO_PROGRESS_STAGES.length);
  });

  it('labels the first stage MusicBrainz', () => {
    render(<BioGenerationProgressTimeline progress={progressAt('musicbrainz')} />);

    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('MusicBrainz');
  });

  it('labels the vision-gating stage "Verifying images"', () => {
    render(<BioGenerationProgressTimeline progress={progressAt('vision-gating')} />);

    expect(screen.getAllByRole('listitem')[6]).toHaveTextContent('Verifying images');
  });

  it('labels the final stage Finalizing', () => {
    render(<BioGenerationProgressTimeline progress={progressAt('finalizing')} />);

    expect(screen.getAllByRole('listitem')[10]).toHaveTextContent('Finalizing');
  });

  it('marks the current stage active via aria-current="step"', () => {
    const { container } = render(
      <BioGenerationProgressTimeline progress={progressAt('drafting')} />
    );

    const active = container.querySelector('[aria-current="step"]');
    expect(active).toHaveTextContent('Drafting');
  });

  it('marks stages before the current one as complete', () => {
    const { container } = render(
      <BioGenerationProgressTimeline progress={progressAt('drafting')} />
    );

    const musicbrainz = screen.getAllByRole('listitem')[0];
    expect(musicbrainz).toHaveAttribute('data-state', 'complete');
    // Sanity: the active row is not the same as the completed row.
    expect(container.querySelector('[aria-current="step"]')).not.toBe(musicbrainz);
  });

  it('marks stages after the current one as upcoming', () => {
    render(<BioGenerationProgressTimeline progress={progressAt('drafting')} />);

    // synthesizing (index 8) comes after drafting (index 7).
    expect(screen.getAllByRole('listitem')[8]).toHaveAttribute('data-state', 'upcoming');
  });

  it('renders counts inline on the active stage', () => {
    const { container } = render(
      <BioGenerationProgressTimeline progress={progressAt('vision-gating', { candidates: 3 })} />
    );

    const active = container.querySelector('[aria-current="step"]');
    expect(active).toHaveTextContent('3 candidates');
  });

  it('does not render counts on non-active stages', () => {
    render(
      <BioGenerationProgressTimeline progress={progressAt('vision-gating', { candidates: 3 })} />
    );

    // musicbrainz (complete) must not carry the active stage's count text.
    expect(screen.getAllByRole('listitem')[0]).not.toHaveTextContent('3 candidates');
  });

  it('keeps the highlight monotonic when a lower stage arrives late', () => {
    const { container, rerender } = render(
      <BioGenerationProgressTimeline progress={progressAt('vision-gating')} />
    );
    // A late/out-of-order lower-stage update (index 2) must not move the
    // highlight backwards from vision-gating (index 6).
    rerender(<BioGenerationProgressTimeline progress={progressAt('commons')} />);

    expect(container.querySelector('[aria-current="step"]')).toHaveTextContent('Verifying images');
  });

  it('does not re-activate an already-completed stage on a late update', () => {
    const { rerender } = render(
      <BioGenerationProgressTimeline progress={progressAt('vision-gating')} />
    );
    rerender(<BioGenerationProgressTimeline progress={progressAt('commons')} />);

    // commons (index 2) stays complete — it does not become active again.
    expect(screen.getAllByRole('listitem')[2]).toHaveAttribute('data-state', 'complete');
  });

  it('falls back to the static copy line when progress is null', () => {
    render(<BioGenerationProgressTimeline progress={null} />);

    expect(screen.getByText(/can take a few minutes/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('falls back to the static copy line when progress is undefined', () => {
    render(<BioGenerationProgressTimeline progress={undefined} />);

    expect(screen.getByText(/can take a few minutes/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SubmissionCard } from '@/lib/types/domain/submission';

import { SubmissionRow } from './submission-row';

const emblaOptions = vi.hoisted(() => vi.fn());
const mockApi = vi.hoisted(() => ({
  canScrollPrev: vi.fn(() => true),
  canScrollNext: vi.fn(() => true),
  scrollPrev: vi.fn(),
  scrollNext: vi.fn(),
  scrollTo: vi.fn(),
  scrollSnapList: vi.fn(() => [0, 1, 2]),
  on: vi.fn(),
  off: vi.fn(),
}));

// The real shared carousel runs; only the engine under it is stubbed, and it
// records the options the row asked for.
vi.mock('embla-carousel-react', () => ({
  __esModule: true,
  default: (options: unknown) => {
    emblaOptions(options);
    return [vi.fn(), mockApi];
  },
}));

vi.mock('@/app/components/gravatar-avatar', () => ({
  GravatarAvatar: () => <span data-testid="avatar" />,
}));

const cards = (count: number): SubmissionCard[] =>
  Array.from({ length: count }, (_unused, index) => ({
    id: String(index).padStart(24, '0'),
    title: `Submission ${index + 1}`,
    category: 'WRITING',
    cardPictureUrl: null,
    owner: { username: 'ada', gravatarHash: 'abc123' },
  }));

const lastOptions = (): { loop?: boolean; breakpoints?: Record<string, { duration?: number }> } =>
  emblaOptions.mock.calls.at(-1)?.[0] ?? {};

describe('SubmissionRow', () => {
  it('heads its cards with the row’s name', () => {
    render(<SubmissionRow heading="Most Recent" cards={cards(3)} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Most Recent' })).toBeInTheDocument();
  });

  it('shows every card it was given', () => {
    render(<SubmissionRow heading="Most Recent" cards={cards(12)} />);

    expect(screen.getAllByRole('link', { name: /^Submission \d+$/ })).toHaveLength(12);
  });

  it('is named for its heading, so a screen reader can tell two rows apart', () => {
    render(<SubmissionRow heading="Most Recent" cards={cards(3)} />);

    expect(screen.getByRole('region', { name: 'Most Recent' })).toBeInTheDocument();
  });

  it('says when it has hydrated, so a press before then is not lost unseen', () => {
    render(<SubmissionRow heading="Most Recent" cards={cards(5)} />);

    expect(screen.getByRole('region', { name: 'Most Recent' })).toHaveAttribute(
      'data-hydrated',
      'true'
    );
  });

  it('renders nothing when it has no cards', () => {
    const { container } = render(<SubmissionRow heading="Most Recent" cards={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('loops in both directions when it holds more cards than fit across', () => {
    render(<SubmissionRow heading="Most Recent" cards={cards(5)} />);

    expect(lastOptions().loop).toBe(true);
  });

  it('does not loop four cards or fewer: there is nothing to loop', () => {
    render(<SubmissionRow heading="Most Recent" cards={cards(4)} />);

    expect(lastOptions().loop).toBe(false);
  });

  it('jumps instead of sliding for a visitor who prefers reduced motion', () => {
    render(<SubmissionRow heading="Most Recent" cards={cards(5)} />);

    expect(lastOptions().breakpoints).toEqual({
      '(prefers-reduced-motion: reduce)': { duration: 0 },
    });
  });

  it('moves with its previous and next buttons', async () => {
    const user = userEvent.setup({ delay: null });
    render(<SubmissionRow heading="Most Recent" cards={cards(5)} />);

    await user.click(screen.getByRole('button', { name: 'Previous in Most Recent' }));
    await user.click(screen.getByRole('button', { name: 'Next in Most Recent' }));

    expect(mockApi.scrollPrev).toHaveBeenCalledTimes(1);
    expect(mockApi.scrollNext).toHaveBeenCalledTimes(1);
  });
});

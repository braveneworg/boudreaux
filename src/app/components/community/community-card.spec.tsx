/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';

import type { SubmissionCard } from '@/lib/types/domain/submission';

import { CommunityCard } from './community-card';
import { SubmissionModalContext } from './use-submission-modal';

// Radix's avatar shows its image only once it has loaded, which jsdom never
// does; the stand-in shows what the card handed it.
vi.mock('@/app/components/gravatar-avatar', () => ({
  GravatarAvatar: ({ hash, alt }: { hash: string; alt: string }) => (
    <span data-testid="avatar" data-hash={hash} data-alt={alt} />
  ),
}));

// Surfaces the link's prefetch posture, which is Link behaviour and not a
// DOM attribute.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={prefetch === undefined ? 'default' : String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

const ID = 'c'.repeat(24);
const PICTURE = 'https://cdn.example/media/submissions/s/a/card.webp';

const card = (overrides: Partial<SubmissionCard> = {}): SubmissionCard => ({
  id: ID,
  title: 'Bus poem',
  category: 'WRITING',
  cardPictureUrl: PICTURE,
  owner: { username: 'ada', gravatarHash: 'abc123' },
  ...overrides,
});

describe('CommunityCard', () => {
  it('carries the submission deep link on its title, for a click the browser keeps', () => {
    render(<CommunityCard card={card()} />);

    expect(screen.getByRole('link', { name: 'Bus poem' })).toHaveAttribute(
      'href',
      `/community?submission=${ID}`
    );
  });

  it('opens the submission over the page on a click of its title', () => {
    const modal = { open: vi.fn(), close: vi.fn() };
    render(
      <SubmissionModalContext value={modal}>
        <CommunityCard card={card()} />
      </SubmissionModalContext>
    );

    const followed = fireEvent.click(screen.getByRole('link', { name: 'Bus poem' }));

    expect(modal.open.mock.calls).toEqual([[ID, screen.getByRole('link', { name: 'Bus poem' })]]);
    expect(followed).toBe(false);
  });

  it('does not prefetch the submission: a page of cards would cost a page each', () => {
    render(<CommunityCard card={card()} />);

    expect(screen.getByRole('link', { name: 'Bus poem' })).toHaveAttribute(
      'data-prefetch',
      'false'
    );
  });

  it('reads “Untitled” for a submission with no title', () => {
    render(<CommunityCard card={card({ title: '' })} />);

    expect(screen.getByRole('link', { name: 'Untitled' })).toBeInTheDocument();
  });

  it('links the username to that user’s listed submissions', () => {
    render(<CommunityCard card={card({ owner: { username: 'a&b', gravatarHash: 'abc123' } })} />);

    expect(screen.getByRole('link', { name: 'a&b' })).toHaveAttribute(
      'href',
      '/community?user=a%26b'
    );
  });

  it('reads “A community member”, not linked, for an owner with no username', () => {
    render(<CommunityCard card={card({ owner: { username: null, gravatarHash: 'abc123' } })} />);

    expect(screen.getByText('A community member')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shows the card picture as decoration: the title already names it', () => {
    render(<CommunityCard card={card()} />);

    const picture = screen.getByRole('presentation');
    expect(picture).toHaveAttribute('src', PICTURE);
    expect(picture).toHaveAttribute('alt', '');
  });

  it('shows a tile naming the category when there is no picture', () => {
    render(<CommunityCard card={card({ cardPictureUrl: null, category: 'ORIGINAL_SONG' })} />);

    expect(screen.getByText('Original song')).toBeInTheDocument();
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
  });

  it('shows the owner’s avatar by its hash, as decoration', () => {
    render(<CommunityCard card={card()} />);

    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveAttribute('data-hash', 'abc123');
    expect(avatar).toHaveAttribute('data-alt', '');
  });

  it('is one stop for the submission, not two: only the title is its link', () => {
    render(<CommunityCard card={card()} />);

    expect(
      screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href') === `/community?submission=${ID}`)
    ).toHaveLength(1);
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useRouter } from 'next/navigation';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useSubmissionSearchQuery } from '@/hooks/queries/use-submission-search-query';
import type { SubmissionCard } from '@/lib/types/domain/submission';

import { CommunitySearch } from './community-search';

vi.mock('@/hooks/queries/use-submission-search-query', () => ({
  useSubmissionSearchQuery: vi.fn(),
}));

// The debounce is the hook's own business; here the term arrives at once.
vi.mock('@/hooks/use-debounce', () => ({ useDebounce: (value: string) => value }));

vi.mock('@/app/components/gravatar-avatar', () => ({
  GravatarAvatar: ({ hash }: { hash: string }) => <span data-testid="avatar" data-hash={hash} />,
}));

const ID = 'c'.repeat(24);

const card = (overrides: Partial<SubmissionCard> = {}): SubmissionCard => ({
  id: ID,
  title: 'Bus poem',
  category: 'WRITING',
  cardPictureUrl: null,
  owner: { username: 'ada', gravatarHash: 'abc123' },
  ...overrides,
});

type QueryResult = ReturnType<typeof useSubmissionSearchQuery>;

const searchReturns = (data: SubmissionCard[] | undefined, isFetching = false): void => {
  vi.mocked(useSubmissionSearchQuery).mockReturnValue({ data, isFetching } as QueryResult);
};

const open = async (): Promise<ReturnType<typeof userEvent.setup>> => {
  const user = userEvent.setup({ delay: null });
  render(<CommunitySearch />);
  await user.click(screen.getByRole('button', { name: 'Search submissions' }));
  return user;
};

describe('CommunitySearch', () => {
  it('does not ask for anything until it is opened', () => {
    searchReturns(undefined);

    render(<CommunitySearch />);

    expect(vi.mocked(useSubmissionSearchQuery).mock.calls.at(-1)).toEqual(['', { enabled: false }]);
  });

  it('says when it has hydrated, so a click before then is not lost unseen', () => {
    searchReturns(undefined);

    render(<CommunitySearch />);

    expect(screen.getByRole('button', { name: 'Search submissions' })).toHaveAttribute(
      'data-hydrated',
      'true'
    );
  });

  it('shows each match with its owner’s avatar, its title and the username', async () => {
    searchReturns([card()]);

    await open();

    const option = screen.getByRole('option', { name: /Bus poem/ });
    expect(option).toHaveTextContent('ada');
    expect(screen.getByTestId('avatar')).toHaveAttribute('data-hash', 'abc123');
  });

  it('reads “A community member” for an owner with no username', async () => {
    searchReturns([card({ owner: { username: null, gravatarHash: 'abc123' } })]);

    await open();

    expect(screen.getByRole('option', { name: /Bus poem/ })).toHaveTextContent(
      'A community member'
    );
  });

  it('reads “Untitled” for a match with no title', async () => {
    searchReturns([card({ title: '' })]);

    await open();

    expect(screen.getByRole('option', { name: /Untitled/ })).toBeInTheDocument();
  });

  it('searches for what is typed', async () => {
    searchReturns([]);

    const user = await open();
    await user.type(screen.getByPlaceholderText('Search by title, about or username'), 'bus');

    expect(vi.mocked(useSubmissionSearchQuery).mock.calls.at(-1)).toEqual([
      'bus',
      { enabled: true },
    ]);
  });

  it('opens the chosen submission’s page', async () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    searchReturns([card()]);

    const user = await open();
    await user.click(screen.getByRole('option', { name: /Bus poem/ }));

    expect(push.mock.calls).toEqual([[`/community/${ID}`]]);
  });

  it('reads “No results yet.” when nothing matches', async () => {
    searchReturns([]);

    await open();

    expect(screen.getByText('No results yet.')).toBeInTheDocument();
  });

  it('says it is searching while a term is in flight', async () => {
    searchReturns([], true);

    await open();

    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useInfiniteListedSubmissionsQuery } from '@/hooks/queries/use-infinite-listed-submissions-query';
import type { SubmissionCard } from '@/lib/types/domain/submission';

import { CommunityList } from './community-list';

vi.mock('@/hooks/queries/use-infinite-listed-submissions-query', () => ({
  useInfiniteListedSubmissionsQuery: vi.fn(),
}));

vi.mock('@/app/components/gravatar-avatar', () => ({
  GravatarAvatar: () => <span data-testid="avatar" />,
}));

const card = (index: number): SubmissionCard => ({
  id: String(index).padStart(24, '0'),
  title: `Submission ${index}`,
  category: 'WRITING',
  cardPictureUrl: null,
  owner: { username: 'ada', gravatarHash: 'abc123' },
});

type QueryResult = ReturnType<typeof useInfiniteListedSubmissionsQuery>;

const queryReturns = (overrides: Record<string, unknown>): void => {
  vi.mocked(useInfiniteListedSubmissionsQuery).mockReturnValue({
    data: undefined,
    isPending: false,
    error: null,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  } as unknown as QueryResult);
};

const pagesOf = (...pages: SubmissionCard[][]): { pages: Array<{ rows: SubmissionCard[] }> } => ({
  pages: pages.map((rows) => ({ rows })),
});

const EMPTY = 'Nothing here yet.';

describe('CommunityList', () => {
  it('says it is loading until the first page arrives', () => {
    queryReturns({ isPending: true });

    render(<CommunityList emptyMessage={EMPTY} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading submissions…');
  });

  it('lists every card of every loaded page, in order', () => {
    queryReturns({ data: pagesOf([card(1), card(2)], [card(3)]) });

    render(<CommunityList emptyMessage={EMPTY} />);

    expect(
      screen.getAllByRole('link', { name: /^Submission \d$/ }).map((link) => link.textContent)
    ).toEqual(['Submission 1', 'Submission 2', 'Submission 3']);
  });

  it('shows a card once when a later page repeats it', () => {
    // A submission approved mid-scroll shifts every later page by one.
    queryReturns({ data: pagesOf([card(1), card(2)], [card(2), card(3)]) });

    render(<CommunityList emptyMessage={EMPTY} />);

    expect(screen.getAllByRole('link', { name: 'Submission 2' })).toHaveLength(1);
  });

  it('says what it was told to when nothing is listed', () => {
    queryReturns({ data: pagesOf([]) });

    render(<CommunityList emptyMessage={EMPTY} />);

    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('reads one user’s list when it is given a username', () => {
    queryReturns({ data: pagesOf([]) });

    render(<CommunityList user="ada" emptyMessage={EMPTY} />);

    expect(vi.mocked(useInfiniteListedSubmissionsQuery).mock.calls.at(-1)).toEqual(['ada']);
  });

  it('says so, and offers another try, when the read fails', async () => {
    const refetch = vi.fn();
    queryReturns({ error: new Error('boom'), refetch });
    const user = userEvent.setup({ delay: null });

    render(<CommunityList emptyMessage={EMPTY} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load submissions.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the cards it has when a later page fails', () => {
    queryReturns({ data: pagesOf([card(1)]), error: new Error('boom') });

    render(<CommunityList emptyMessage={EMPTY} />);

    expect(screen.getByRole('link', { name: 'Submission 1' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says more are loading while the next page is fetched', () => {
    queryReturns({ data: pagesOf([card(1)]), hasNextPage: true, isFetchingNextPage: true });

    render(<CommunityList emptyMessage={EMPTY} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading more submissions…');
  });
});

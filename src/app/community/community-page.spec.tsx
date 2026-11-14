/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { communityViewer } from '@/lib/community/community-session';
import { COMMUNITY_DESCRIPTION, COMMUNITY_PAGE_SIZE } from '@/lib/constants/submissions';
import { SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionCard } from '@/lib/types/domain/submission';

import CommunityPage, { generateMetadata } from './page';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('@/lib/community/community-session', () => ({ communityViewer: vi.fn() }));
vi.mock('@/lib/services/submission-service', () => ({
  SubmissionService: { listCards: vi.fn(), ownerNamed: vi.fn() },
}));

const setQueryData = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({ setQueryData }),
}));
vi.mock('@tanstack/react-query', () => ({
  dehydrate: vi.fn(() => ({})),
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="hydration-boundary">{children}</div>
  ),
}));

interface Crumb {
  anchorText: string;
  url: string;
  isActive: boolean;
}

vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({ items }: { items: Crumb[] }) => (
    <nav data-testid="breadcrumb">
      {items.map(({ anchorText, url }) => `${anchorText}=${url}`).join('|')}
    </nav>
  ),
}));
vi.mock('@/app/components/community/community-search', () => ({
  CommunitySearch: () => <div data-testid="search" />,
}));
vi.mock('@/app/components/community/submission-row', () => ({
  SubmissionRow: ({ heading, cards }: { heading: string; cards: SubmissionCard[] }) => (
    <div
      data-testid="row"
      data-heading={heading}
      data-cards={cards.map(({ id }) => id).join(',')}
    />
  ),
}));
vi.mock('@/app/components/community/view-all-link', () => ({
  ViewAllLink: () => <a href="#all-submissions">View all user submitted content</a>,
}));
vi.mock('@/app/components/community/community-list', () => ({
  CommunityList: ({ user, emptyMessage }: { user?: string; emptyMessage: string }) => (
    <div data-testid="list" data-user={user ?? ''} data-empty={emptyMessage} />
  ),
}));

const OWNER_ID = 'a'.repeat(24);

const card = (index: number): SubmissionCard => ({
  id: String(index).padStart(24, '0'),
  title: `Submission ${index}`,
  category: 'WRITING',
  cardPictureUrl: null,
  owner: { username: 'ada', gravatarHash: 'abc123' },
});

const cards = (count: number): SubmissionCard[] =>
  Array.from({ length: count }, (_unused, index) => card(index + 1));

const open = async (query: Record<string, string | string[]> = {}): Promise<void> => {
  render(await CommunityPage({ searchParams: Promise.resolve(query) }));
};

const signedOut = (): void => {
  vi.mocked(communityViewer).mockResolvedValueOnce(null);
};

const listed = (rows: SubmissionCard[]): void => {
  vi.mocked(SubmissionService.listCards).mockResolvedValueOnce(rows);
};

const ownerIs = (username: string | null): void => {
  vi.mocked(SubmissionService.ownerNamed).mockResolvedValueOnce(
    username === null ? null : { id: OWNER_ID, username }
  );
};

describe('CommunityPage', () => {
  describe('everyone’s submissions', () => {
    it('is headed “User Submitted Content”, with the agreed description', async () => {
      signedOut();
      listed(cards(2));

      await open();

      expect(
        screen.getByRole('heading', { level: 1, name: 'User Submitted Content' })
      ).toBeInTheDocument();
      expect(screen.getByText(COMMUNITY_DESCRIPTION)).toBeInTheDocument();
    });

    it('leads with the search, then the heading, the row, the link and the list', async () => {
      signedOut();
      listed(cards(2));

      await open();

      const order = [
        screen.getByTestId('search'),
        screen.getByRole('heading', { level: 1 }),
        screen.getByTestId('row'),
        screen.getByRole('link', { name: 'View all user submitted content' }),
        screen.getByRole('heading', { level: 2, name: 'All submissions' }),
        screen.getByTestId('list'),
      ];
      const follows = order
        .slice(1)
        .map(
          (element, index) =>
            (order.at(index)?.compareDocumentPosition(element) ?? 0) &
            Node.DOCUMENT_POSITION_FOLLOWING
        );

      expect(follows.every((bit) => bit !== 0)).toBe(true);
    });

    it('links to the form', async () => {
      signedOut();
      listed(cards(1));

      await open();

      expect(screen.getByRole('link', { name: 'Submit something' })).toHaveAttribute(
        'href',
        '/community/submit'
      );
    });

    it('offers a signed-in visitor their own submissions', async () => {
      vi.mocked(communityViewer).mockResolvedValueOnce({ id: OWNER_ID, role: 'user' });
      listed(cards(1));

      await open();

      expect(screen.getByRole('link', { name: 'Your submissions' })).toHaveAttribute(
        'href',
        '/community/mine'
      );
    });

    it('does not offer a signed-out visitor a list they do not have', async () => {
      signedOut();
      listed(cards(1));

      await open();

      expect(screen.queryByRole('link', { name: 'Your submissions' })).not.toBeInTheDocument();
    });

    it('reads the newest listed submissions once, for the row and the list’s first page', async () => {
      signedOut();
      listed(cards(2));

      await open();

      expect(vi.mocked(SubmissionService.listCards).mock.calls).toEqual([
        [{ skip: 0, take: COMMUNITY_PAGE_SIZE }],
      ]);
    });

    it('gives Most Recent the newest twelve', async () => {
      signedOut();
      listed(cards(12));

      await open();

      const row = screen.getByTestId('row');
      expect(row).toHaveAttribute('data-heading', 'Most Recent');
      expect(row.getAttribute('data-cards')?.split(',')).toHaveLength(12);
    });

    it('hands the list its first page under the key the list reads', async () => {
      signedOut();
      const rows = cards(COMMUNITY_PAGE_SIZE);
      listed(rows);

      await open();

      expect(setQueryData.mock.calls).toEqual([
        [
          ['submissions', 'listedInfinite', ''],
          { pages: [{ rows, nextSkip: COMMUNITY_PAGE_SIZE }], pageParams: [0] },
        ],
      ]);
    });

    it('shows no row, no link and no list heading when nothing is listed', async () => {
      signedOut();
      listed([]);

      await open();

      expect(screen.queryByTestId('row')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /View all/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
      expect(screen.getByTestId('list')).toHaveAttribute(
        'data-empty',
        'Nothing here yet. Be the first to submit something.'
      );
    });

    it('still renders, and leaves the list to read for itself, when the read fails', async () => {
      signedOut();
      vi.mocked(SubmissionService.listCards).mockRejectedValueOnce(new Error('mongo: boom'));

      await open();

      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getByTestId('list')).toBeInTheDocument();
      expect(setQueryData).not.toHaveBeenCalled();
    });

    it('leads its breadcrumbs with the community page', async () => {
      signedOut();
      listed([]);

      await open();

      expect(screen.getByTestId('breadcrumb')).toHaveTextContent('Community=/community');
    });

    it('answers not found for a banned account, as every community page does', async () => {
      vi.mocked(communityViewer).mockRejectedValueOnce(new Error('NOT_FOUND'));

      await expect(open()).rejects.toThrow('NOT_FOUND');
    });
  });

  describe('one user’s submissions', () => {
    it('heads the list with the username and links back to everyone’s', async () => {
      ownerIs('ada');
      signedOut();
      listed(cards(1));

      await open({ user: 'ada' });

      expect(
        screen.getByRole('heading', { level: 2, name: 'Submissions by ada' })
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View everyone’s submissions' })).toHaveAttribute(
        'href',
        '/community'
      );
    });

    it('reads and lists only that user’s', async () => {
      ownerIs('ada');
      signedOut();
      listed(cards(1));

      await open({ user: ' ada ' });

      expect(vi.mocked(SubmissionService.ownerNamed).mock.calls).toEqual([['ada']]);
      expect(vi.mocked(SubmissionService.listCards).mock.calls).toEqual([
        [{ skip: 0, take: COMMUNITY_PAGE_SIZE, ownerId: OWNER_ID }],
      ]);
      expect(screen.getByTestId('list')).toHaveAttribute('data-user', 'ada');
      expect(setQueryData.mock.calls[0]?.[0]).toEqual(['submissions', 'listedInfinite', 'ada']);
    });

    it('drops the row and the “view all” link', async () => {
      ownerIs('ada');
      signedOut();
      listed(cards(3));

      await open({ user: 'ada' });

      expect(screen.queryByTestId('row')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /View all/ })).not.toBeInTheDocument();
    });

    it('says nothing is listed for a user with none', async () => {
      ownerIs('ada');
      signedOut();
      listed([]);

      await open({ user: 'ada' });

      expect(screen.getByTestId('list')).toHaveAttribute('data-empty', 'Nothing listed yet.');
    });

    it('takes the first username when the param repeats', async () => {
      ownerIs('ada');
      signedOut();
      listed([]);

      await open({ user: ['ada', 'bob'] });

      expect(vi.mocked(SubmissionService.ownerNamed).mock.calls).toEqual([['ada']]);
    });

    it('answers not found for a username that names no account, reading nothing', async () => {
      ownerIs(null);

      await expect(open({ user: 'nobody' })).rejects.toThrow('NOT_FOUND');
      expect(SubmissionService.listCards).not.toHaveBeenCalled();
    });

    it('answers not found for a username longer than one can be, without a lookup', async () => {
      await expect(open({ user: 'a'.repeat(101) })).rejects.toThrow('NOT_FOUND');
      expect(SubmissionService.ownerNamed).not.toHaveBeenCalled();
    });

    it('adds the user to the breadcrumbs', async () => {
      ownerIs('ada');
      signedOut();
      listed([]);

      await open({ user: 'ada' });

      expect(screen.getByTestId('breadcrumb')).toHaveTextContent(
        'Community=/community|ada=/community?user=ada'
      );
    });
  });

  describe('metadata', () => {
    it('titles the page and describes it as agreed', async () => {
      await expect(generateMetadata({ searchParams: Promise.resolve({}) })).resolves.toEqual({
        title: 'User Submitted Content',
        description: COMMUNITY_DESCRIPTION,
      });
    });

    it('titles one user’s list with the username', async () => {
      ownerIs('ada');

      await expect(
        generateMetadata({ searchParams: Promise.resolve({ user: 'ada' }) })
      ).resolves.toMatchObject({ title: 'Submissions by ada' });
    });

    it('says nothing, and asks not to be indexed, for a username that names no account', async () => {
      ownerIs(null);

      await expect(
        generateMetadata({ searchParams: Promise.resolve({ user: 'nobody' }) })
      ).resolves.toEqual({ title: 'Not found', robots: { index: false, follow: false } });
    });
  });
});

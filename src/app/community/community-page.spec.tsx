/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { communityViewer } from '@/lib/community/community-session';
import { COMMUNITY_DESCRIPTION, COMMUNITY_PAGE_SIZE } from '@/lib/constants/submissions';
import { SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionCard, SubmissionView } from '@/lib/types/domain/submission';

import CommunityPage, { generateMetadata } from './page';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('@/lib/community/community-session', () => ({ communityViewer: vi.fn() }));
vi.mock('@/lib/services/submission-service', () => ({
  SubmissionService: {
    listCards: vi.fn(),
    ownerNamed: vi.fn(),
    getForViewer: vi.fn(),
    // Nothing is trending unless a test says so.
    listTrendingCards: vi.fn(async () => []),
  },
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
const LINKED_ID = 'c'.repeat(24);
const WHEN = new Date('2026-11-02T09:00:00.000Z');

/** A submission as a deep link's reader may see it. */
const view = (overrides: Partial<SubmissionView> = {}): SubmissionView => ({
  id: LINKED_ID,
  ownerId: OWNER_ID,
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '',
  writingHtml: '<p>A poem.</p>',
  links: [],
  listed: true,
  status: 'APPROVED',
  rejectionReason: null,
  publishedAt: WHEN,
  updatedAt: WHEN,
  owner: { username: 'fan', gravatarHash: 'abc' },
  viewer: 'public',
  isPublic: true,
  queuePosition: null,
  attachments: [],
  ...overrides,
});

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

    describe('Trending', () => {
      const rowHeadings = (): Array<string | null> =>
        screen.getAllByTestId('row').map((row) => row.getAttribute('data-heading'));

      it('sits under Most Recent and above the “view all” link', async () => {
        signedOut();
        listed(cards(3));
        vi.mocked(SubmissionService.listTrendingCards).mockResolvedValueOnce([card(2)]);

        await open();

        const [, trending] = screen.getAllByTestId('row');
        const link = screen.getByRole('link', { name: 'View all user submitted content' });
        expect(rowHeadings()).toEqual(['Most Recent', 'Trending']);
        expect(
          (trending?.compareDocumentPosition(link) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING
        ).not.toBe(0);
      });

      it('holds the cards the service chose, in its order', async () => {
        signedOut();
        listed(cards(3));
        vi.mocked(SubmissionService.listTrendingCards).mockResolvedValueOnce([card(3), card(1)]);

        await open();

        expect(screen.getAllByTestId('row')[1]).toHaveAttribute(
          'data-cards',
          `${card(3).id},${card(1).id}`
        );
      });

      it('is not rendered when no submission has the views for it', async () => {
        signedOut();
        listed(cards(3));

        await open();

        expect(rowHeadings()).toEqual(['Most Recent']);
      });

      it('is left out, and the page still renders, when its read fails', async () => {
        signedOut();
        listed(cards(3));
        vi.mocked(SubmissionService.listTrendingCards).mockRejectedValueOnce(
          new Error('mongo: boom')
        );

        await open();

        expect(rowHeadings()).toEqual(['Most Recent']);
        expect(screen.getByTestId('list')).toBeInTheDocument();
      });

      it('still shows, with the “view all” link, when the newest could not be read', async () => {
        signedOut();
        vi.mocked(SubmissionService.listCards).mockRejectedValueOnce(new Error('mongo: boom'));
        vi.mocked(SubmissionService.listTrendingCards).mockResolvedValueOnce([card(1)]);

        await open();

        expect(rowHeadings()).toEqual(['Trending']);
        expect(
          screen.getByRole('link', { name: 'View all user submitted content' })
        ).toBeInTheDocument();
      });

      it('is not read for one user’s list, which shows no rows', async () => {
        ownerIs('ada');
        signedOut();
        listed(cards(3));

        await open({ user: 'ada' });

        expect(vi.mocked(SubmissionService.listTrendingCards).mock.calls).toEqual([]);
      });
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

  describe('a submission deep link', () => {
    /** The page and the deep link's read each ask who is reading. */
    const readBy = (viewer: { id: string; role: string | null } | null): void => {
      vi.mocked(communityViewer).mockResolvedValueOnce(viewer).mockResolvedValueOnce(viewer);
    };

    const linkedIs = (found: SubmissionView | null): void => {
      vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(found);
    };

    const seededSubmission = (): unknown[] | undefined =>
      setQueryData.mock.calls.find(([key]) => (key as string[])[1] === 'detail');

    it('reads the submission it names, as this reader may see it', async () => {
      readBy({ id: OWNER_ID, role: 'manager' });
      listed(cards(2));
      linkedIs(view({ viewer: 'approver' }));

      await open({ submission: LINKED_ID });

      expect(vi.mocked(SubmissionService.getForViewer).mock.calls).toEqual([
        [LINKED_ID, { id: OWNER_ID, role: 'manager' }],
      ]);
    });

    it('hands the submission modal what it read, under the key the modal reads', async () => {
      readBy(null);
      listed(cards(2));
      linkedIs(view());

      await open({ submission: LINKED_ID });

      expect(seededSubmission()).toEqual([
        ['submissions', 'detail', LINKED_ID],
        expect.objectContaining({ id: LINKED_ID, title: 'Bus poem', viewer: 'public' }),
      ]);
    });

    it('hands over nothing of the owner’s id or the dates', async () => {
      readBy(null);
      listed(cards(2));
      linkedIs(view());

      await open({ submission: LINKED_ID });

      expect(Object.keys(seededSubmission()?.[1] as object)).not.toEqual(
        expect.arrayContaining(['ownerId', 'publishedAt', 'updatedAt'])
      );
    });

    it('still shows the community page beneath', async () => {
      readBy(null);
      listed(cards(2));
      linkedIs(view());

      await open({ submission: LINKED_ID });

      expect(
        screen.getByRole('heading', { level: 1, name: 'User Submitted Content' })
      ).toBeInTheDocument();
      expect(screen.getByTestId('list')).toBeInTheDocument();
    });

    it('renders the page, handing over nothing, for a submission this reader may not open', async () => {
      readBy(null);
      listed(cards(2));
      linkedIs(null);

      await open({ submission: LINKED_ID });

      expect(seededSubmission()).toBeUndefined();
      expect(screen.getByTestId('list')).toBeInTheDocument();
    });

    it('reads nothing for a value that cannot be an id', async () => {
      signedOut();
      listed(cards(2));

      await open({ submission: 'not-an-id' });

      expect(SubmissionService.getForViewer).not.toHaveBeenCalled();
    });

    it('reads no submission without a deep link', async () => {
      signedOut();
      listed(cards(2));

      await open();

      expect(SubmissionService.getForViewer).not.toHaveBeenCalled();
    });

    it('still renders, and leaves the modal to read for itself, when the read fails', async () => {
      readBy(null);
      listed(cards(2));
      vi.mocked(SubmissionService.getForViewer).mockRejectedValueOnce(new Error('database down'));

      await open({ submission: LINKED_ID });

      expect(seededSubmission()).toBeUndefined();
      expect(screen.getByTestId('list')).toBeInTheDocument();
    });

    it('takes the first id when the param repeats', async () => {
      readBy(null);
      listed(cards(2));
      linkedIs(view());

      await open({ submission: [LINKED_ID, 'e'.repeat(24)] });

      expect(vi.mocked(SubmissionService.getForViewer).mock.calls).toEqual([[LINKED_ID, null]]);
    });

    describe('metadata', () => {
      const metadataFor = async (found: SubmissionView | null) => {
        vi.mocked(communityViewer).mockResolvedValueOnce(null);
        linkedIs(found);
        return generateMetadata({ searchParams: Promise.resolve({ submission: LINKED_ID }) });
      };

      const photo = {
        id: 'e'.repeat(24),
        kind: 'IMAGE' as const,
        fileName: '',
        state: 'ready' as const,
        error: null,
        progress: null,
        url: 'https://cdn.example/media/submissions/s/a/copy.jpg',
        cardUrl: 'https://cdn.example/media/submissions/s/a/card.webp',
        posterUrl: null,
        width: 1200,
        height: 800,
        durationSeconds: null,
      };
      const clip = {
        ...photo,
        id: '1'.repeat(24),
        kind: 'VIDEO' as const,
        url: 'https://cdn.example/media/submissions/s/v/copy.mp4',
        posterUrl: 'https://cdn.example/media/submissions/s/v/poster.jpg',
      };

      it('titles the page with the submission a shared link opens', async () => {
        await expect(metadataFor(view())).resolves.toEqual({ title: 'Bus poem' });
      });

      it('titles a submission that has no title yet as untitled', async () => {
        await expect(metadataFor(view({ title: '' }))).resolves.toEqual({ title: 'Untitled' });
      });

      it.each([
        ['an unlisted submission', view({ listed: false })],
        ['a submission that is not public', view({ status: 'DRAFT', isPublic: false })],
      ])('asks for %s to be kept out of search engines', async (_name, found) => {
        await expect(metadataFor(found)).resolves.toEqual({
          title: 'Bus poem',
          robots: { index: false, follow: false },
        });
      });

      it('previews a shared link with the first photo of a public submission', async () => {
        await expect(metadataFor(view({ attachments: [clip, photo] }))).resolves.toMatchObject({
          openGraph: { title: 'Bus poem', images: [photo.url] },
        });
      });

      it('previews with a frame of the first video when there is no photo', async () => {
        await expect(metadataFor(view({ attachments: [clip] }))).resolves.toMatchObject({
          openGraph: { images: [clip.posterUrl] },
        });
      });

      it('previews an unlisted public submission too, and still keeps it out of search', async () => {
        await expect(
          metadataFor(view({ listed: false, attachments: [photo] }))
        ).resolves.toMatchObject({
          openGraph: { images: [photo.url] },
          robots: { index: false, follow: false },
        });
      });

      it('puts no picture in the head of a submission that is not public', async () => {
        const metadata = await metadataFor(
          view({ status: 'DRAFT', isPublic: false, attachments: [photo] })
        );

        expect(metadata.openGraph).toBeUndefined();
      });

      it('is the community page’s own for a submission this reader may not open', async () => {
        await expect(metadataFor(null)).resolves.toEqual({
          title: 'User Submitted Content',
          description: COMMUNITY_DESCRIPTION,
        });
      });

      it('is still not found for a username that names no account', async () => {
        ownerIs(null);

        await expect(
          generateMetadata({
            searchParams: Promise.resolve({ user: 'nobody', submission: LINKED_ID }),
          })
        ).resolves.toEqual({ title: 'Not found', robots: { index: false, follow: false } });
        expect(SubmissionService.getForViewer).not.toHaveBeenCalled();
      });
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

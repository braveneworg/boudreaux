/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import { requireCommunityUser } from '@/lib/community/community-session';
import { UPLOAD_AGREEMENT_VERSION } from '@/lib/constants/submissions';
import { SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionRecord, SubmissionView } from '@/lib/types/domain/submission';

import EditSubmissionPage from './[id]/edit/page';
import MySubmissionsPage from './mine/page';
import SubmitPage from './submit/page';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('@/lib/community/community-session', () => ({
  requireCommunityUser: vi.fn(),
}));
vi.mock('@/lib/services/submission-service', () => ({
  SubmissionService: {
    getForViewer: vi.fn(),
    listMine: vi.fn(),
    // No submission has a card picture unless a test hands it one.
    cardPictures: vi.fn(async () => new Map<string, string>()),
  },
}));
vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({ items }: { items: Array<{ anchorText: string; url: string }> }) => (
    <nav data-testid="breadcrumb">
      {items.map(({ anchorText, url }) => `${anchorText}=${url}`).join('|')}
    </nav>
  ),
}));
vi.mock('@/app/components/community/submission-form', () => ({
  SubmissionForm: ({
    needsAgreement,
    submission,
  }: {
    needsAgreement: boolean;
    submission?: { id: string; title: string };
  }) => (
    <div
      data-testid="form"
      data-needs-agreement={String(needsAgreement)}
      data-submission={submission ? `${submission.id}:${submission.title}` : ''}
    />
  ),
}));

const ID = 'c'.repeat(24);
const USER_ID = 'a'.repeat(24);
const WHEN = new Date('2026-11-02T09:00:00.000Z');

const user = (uploadAgreementVersion: number | null = UPLOAD_AGREEMENT_VERSION) =>
  ({ id: USER_ID, role: 'admin', uploadAgreementVersion }) as never;

const view = (overrides: Partial<SubmissionView> = {}): SubmissionView => ({
  id: ID,
  ownerId: USER_ID,
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
  viewer: 'owner',
  isPublic: true,
  queuePosition: null,
  attachments: [],
  ...overrides,
});

const record = (overrides: Partial<SubmissionRecord> = {}): SubmissionRecord => ({
  id: ID,
  ownerId: USER_ID,
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '',
  aboutText: '',
  writingHtml: '',
  links: [],
  listed: false,
  status: 'DRAFT',
  publishedAt: null,
  firstApprovedAt: null,
  approvedAt: null,
  approvedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  rejectionReason: null,
  createdAt: WHEN,
  updatedAt: WHEN,
  ...overrides,
});

const params = (id: string = ID) => ({ params: Promise.resolve({ id }) });

describe('SubmitPage', () => {
  it('asks who is signed in, to return here after sign-in', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());

    render(await SubmitPage());

    expect(vi.mocked(requireCommunityUser).mock.calls).toEqual([['/community/submit']]);
  });

  it('leads its breadcrumbs back to the community page', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());

    render(await SubmitPage());

    expect(screen.getByTestId('breadcrumb')).toHaveTextContent(
      'Community=/community|Your submissions=/community/mine|Submit something=/community/submit'
    );
  });

  it('shows an empty form that asks for no agreement from an account that holds it', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());

    render(await SubmitPage());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Submit something');
    expect(screen.getByTestId('form')).toHaveAttribute('data-needs-agreement', 'false');
    expect(screen.getByTestId('form')).toHaveAttribute('data-submission', '');
  });

  it.each([null, UPLOAD_AGREEMENT_VERSION - 1])(
    'asks for the agreement from an account at version %s',
    async (version) => {
      vi.mocked(requireCommunityUser).mockResolvedValueOnce(user(version));

      render(await SubmitPage());

      expect(screen.getByTestId('form')).toHaveAttribute('data-needs-agreement', 'true');
    }
  );
});

describe('EditSubmissionPage', () => {
  it('loads the owner’s submission into the form', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(view());

    render(await EditSubmissionPage(params()));

    expect(screen.getByTestId('form')).toHaveAttribute('data-submission', `${ID}:Bus poem`);
    expect(vi.mocked(SubmissionService.getForViewer).mock.calls).toEqual([
      [ID, { id: USER_ID, role: 'admin' }],
    ]);
    expect(vi.mocked(requireCommunityUser).mock.calls).toEqual([[`/community/${ID}/edit`]]);
  });

  it('leads its breadcrumbs back to the community page', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(view({ viewer: 'owner' }));

    render(await EditSubmissionPage({ params: Promise.resolve({ id: ID }) }));

    expect(screen.getByTestId('breadcrumb')).toHaveTextContent(
      `Community=/community|Your submissions=/community/mine|Edit=/community/${ID}/edit`
    );
  });

  it('shows the owner where it stands above the form', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(
      view({ status: 'REJECTED', isPublic: false, rejectionReason: 'Not your recording.' })
    );

    render(await EditSubmissionPage(params()));

    expect(screen.getByRole('status')).toHaveTextContent('Reason: Not your recording.');
  });

  it.each([
    ['a submission that does not exist or is not theirs to see', null],
    ['a submission they can read but do not own', view({ viewer: 'approver' })],
  ])('answers not found for %s', async (_name, found) => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(found);

    await expect(EditSubmissionPage(params())).rejects.toThrow('NOT_FOUND');
  });

  it('answers not found for an id that cannot be one, without asking the service', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());

    await expect(EditSubmissionPage(params('nope'))).rejects.toThrow('NOT_FOUND');
    expect(SubmissionService.getForViewer).not.toHaveBeenCalled();
  });
});

describe('MySubmissionsPage', () => {
  it('lists the owner’s submissions, each with its state and a link to it', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());
    vi.mocked(SubmissionService.listMine).mockResolvedValueOnce([
      record({ status: 'APPROVED', listed: true }),
      record({ id: 'd'.repeat(24), title: '', status: 'DRAFT' }),
    ]);

    render(await MySubmissionsPage());

    const rows = within(screen.getByRole('list', { name: 'Your submissions' })).getAllByRole(
      'listitem'
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Bus poem'),
      expect.stringContaining('Untitled'),
    ]);
    expect(rows[0]).toHaveTextContent('Approved, listed');
    expect(rows[1]).toHaveTextContent('Draft');
    // The submission deep link: a click opens the submission over this list.
    expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'Bus poem' })).toHaveAttribute(
      'href',
      `/community?submission=${ID}`
    );
    expect(vi.mocked(SubmissionService.listMine).mock.calls).toEqual([[USER_ID]]);
  });

  it('leads its breadcrumbs back to the community page', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());
    vi.mocked(SubmissionService.listMine).mockResolvedValueOnce([]);

    render(await MySubmissionsPage());

    expect(screen.getByTestId('breadcrumb')).toHaveTextContent(
      'Community=/community|Your submissions=/community/mine'
    );
  });

  it('shows each submission’s card picture, or a tile naming its category', async () => {
    const draftId = 'd'.repeat(24);
    const submissions = [
      record({ status: 'APPROVED', category: 'PHOTO' }),
      record({ id: draftId, status: 'DRAFT', category: 'ORIGINAL_SONG' }),
    ];
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());
    vi.mocked(SubmissionService.listMine).mockResolvedValueOnce(submissions);
    vi.mocked(SubmissionService.cardPictures).mockResolvedValueOnce(
      new Map([[ID, 'https://cdn.example/media/submissions/s/a/card.webp']])
    );

    render(await MySubmissionsPage());

    const [pictured, tiled] = screen.getAllByRole('listitem');
    expect(within(pictured as HTMLElement).getByRole('presentation')).toHaveAttribute(
      'src',
      'https://cdn.example/media/submissions/s/a/card.webp'
    );
    expect(tiled).toHaveTextContent('Original song');
    expect(vi.mocked(SubmissionService.cardPictures).mock.calls).toEqual([[submissions]]);
  });

  it('shows why a rejected submission was rejected', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());
    vi.mocked(SubmissionService.listMine).mockResolvedValueOnce([
      record({ status: 'REJECTED', rejectionReason: 'Not your recording.' }),
    ]);

    render(await MySubmissionsPage());

    expect(screen.getByText('Reason: Not your recording.')).toBeInTheDocument();
  });

  it('says so when there are none, and offers the form either way', async () => {
    vi.mocked(requireCommunityUser).mockResolvedValueOnce(user());
    vi.mocked(SubmissionService.listMine).mockResolvedValueOnce([]);

    render(await MySubmissionsPage());

    expect(screen.getByText('You have not submitted anything yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Submit something' })).toHaveAttribute(
      'href',
      '/community/submit'
    );
  });
});

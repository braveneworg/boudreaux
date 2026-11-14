/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import { requireApprover } from '@/lib/community/community-session';
import { ManagerService } from '@/lib/services/manager-service';
import { SubmissionReportService } from '@/lib/services/submission-report-service';
import { SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionQueueRow, SubmissionView } from '@/lib/types/domain/submission';
import type {
  ReportedSubmissionRow,
  SubmissionReportView,
} from '@/lib/types/domain/submission-report';

import ReviewSubmissionPage from './[id]/page';
import ApproverLayout from './layout';
import ManagersPage from './managers/page';
import QueuePage from './page';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('@/lib/community/community-session', () => ({ requireApprover: vi.fn() }));
vi.mock('@/lib/services/submission-service', () => ({
  SubmissionService: {
    getForViewer: vi.fn(),
    listQueue: vi.fn(),
    // No row has a card picture unless a test hands it one.
    cardPictures: vi.fn(async () => new Map<string, string>()),
  },
}));
// No submission is reported unless a test says so.
vi.mock('@/lib/services/submission-report-service', () => ({
  SubmissionReportService: {
    listForSubmission: vi.fn(async () => []),
    listReported: vi.fn(async () => ({ rows: [], total: 0 })),
    countReported: vi.fn(async () => 0),
  },
}));
vi.mock('@/lib/services/manager-service', () => ({ ManagerService: { list: vi.fn() } }));
vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: () => <nav data-testid="breadcrumb" />,
}));
vi.mock('@/app/admin/components/admin-nav', () => ({
  AdminNav: ({ hrefs }: { hrefs?: readonly string[] }) => (
    <nav data-testid="admin-nav" data-hrefs={hrefs ? hrefs.join(',') : 'all'} />
  ),
}));
vi.mock('@/app/components/community/submission-view', () => ({
  SubmissionViewContent: ({ view, reportable }: { view: SubmissionView; reportable?: boolean }) => (
    <div data-testid="view" data-title={view.title} data-reportable={String(reportable === true)} />
  ),
}));
vi.mock('@/app/components/community/submission-report-list', () => ({
  SubmissionReportList: ({ reports }: { reports: SubmissionReportView[] }) => (
    <div data-testid="reports" data-notes={reports.map(({ note }) => note).join('|')} />
  ),
}));
vi.mock('@/app/components/community/submission-decision-panel', () => ({
  SubmissionDecisionPanel: ({
    submissionId,
    status,
    loadedUpdatedAt,
  }: {
    submissionId: string;
    status: string;
    loadedUpdatedAt: string;
  }) => (
    <div
      data-testid="decision"
      data-id={submissionId}
      data-status={status}
      data-loaded={loadedUpdatedAt}
    />
  ),
}));
vi.mock('@/app/components/community/manager-controls', () => ({
  ManagerControls: ({ managers }: { managers: Array<{ username: string | null }> }) => (
    <div data-testid="managers" data-names={managers.map(({ username }) => username).join(',')} />
  ),
}));

const ID = 'c'.repeat(24);
const USER_ID = 'a'.repeat(24);
const WHEN = new Date('2026-11-02T09:00:00.000Z');

const approver = (role: 'admin' | 'manager') => ({ id: USER_ID, role }) as never;

const row = (overrides: Partial<SubmissionQueueRow> = {}): SubmissionQueueRow => ({
  id: ID,
  title: 'Bus poem',
  category: 'WRITING',
  listed: false,
  status: 'AWAITING_APPROVAL',
  ownerUsername: 'fan',
  publishedAt: WHEN,
  approvedAt: null,
  rejectedAt: null,
  updatedAt: WHEN,
  ...overrides,
});

const view = (overrides: Partial<SubmissionView> = {}): SubmissionView => ({
  id: ID,
  ownerId: 'b'.repeat(24),
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '',
  writingHtml: '<p>A poem.</p>',
  links: [],
  listed: false,
  status: 'AWAITING_APPROVAL',
  rejectionReason: null,
  publishedAt: WHEN,
  updatedAt: WHEN,
  owner: { username: 'fan', gravatarHash: 'abc' },
  viewer: 'approver',
  isPublic: false,
  queuePosition: null,
  attachments: [],
  ...overrides,
});

const reportedRow = (overrides: Partial<ReportedSubmissionRow> = {}): ReportedSubmissionRow => ({
  id: ID,
  title: 'Bus poem',
  category: 'WRITING',
  status: 'APPROVED',
  ownerUsername: 'fan',
  openReports: 2,
  oldestReportAt: WHEN,
  ...overrides,
});

const reportView = (overrides: Partial<SubmissionReportView> = {}): SubmissionReportView => ({
  id: 'e'.repeat(24),
  reason: 'HARMFUL',
  note: 'Threats in the about.',
  createdAt: WHEN,
  handled: false,
  handledAt: null,
  handledByUsername: null,
  hasContact: false,
  contactEmail: null,
  ...overrides,
});

const search = (query: Record<string, string> = {}) => ({ searchParams: Promise.resolve(query) });
const params = (id: string = ID) => ({ params: Promise.resolve({ id }) });

describe('ApproverLayout', () => {
  it('gives an admin the whole admin navigation', async () => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver('admin'));

    render(await ApproverLayout({ children: <p>child</p> }));

    expect(screen.getByTestId('admin-nav')).toHaveAttribute('data-hrefs', 'all');
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(vi.mocked(requireApprover).mock.calls).toEqual([['approver']]);
  });

  it('gives a manager the Community section alone', async () => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver('manager'));

    render(await ApproverLayout({ children: <p>child</p> }));

    expect(screen.getByTestId('admin-nav')).toHaveAttribute('data-hrefs', '/admin/community');
  });
});

describe('QueuePage', () => {
  const open = async (
    query: Record<string, string> = {},
    role: 'admin' | 'manager' = 'manager'
  ) => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver(role));
    return render(await QueuePage(search(query)));
  };

  it('asks for approver access itself, not only through the layout', async () => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [], total: 0 });

    await open();

    expect(vi.mocked(requireApprover).mock.calls).toEqual([['approver']]);
  });

  it('opens on the submissions awaiting approval', async () => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [row()], total: 1 });

    await open();

    expect(vi.mocked(SubmissionService.listQueue).mock.calls).toEqual([
      ['AWAITING_APPROVAL', { skip: 0, take: 25 }],
    ]);
    expect(screen.getByRole('link', { name: 'Awaiting approval' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it.each([
    ['approved', 'APPROVED'],
    ['rejected', 'REJECTED'],
    ['something-else', 'AWAITING_APPROVAL'],
  ])('reads ?status=%s as the %s queue', async (status, expected) => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [], total: 0 });

    await open({ status });

    expect(vi.mocked(SubmissionService.listQueue).mock.calls[0]?.[0]).toBe(expected);
  });

  it('reads ?page as which page of the queue to show', async () => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [], total: 60 });

    await open({ page: '3' });

    expect(vi.mocked(SubmissionService.listQueue).mock.calls[0]?.[1]).toEqual({
      skip: 50,
      take: 25,
    });
  });

  it.each(['0', '-2', 'abc'])('reads ?page=%s as the first page', async (page) => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [], total: 0 });

    await open({ page });

    expect(vi.mocked(SubmissionService.listQueue).mock.calls[0]?.[1]).toEqual({
      skip: 0,
      take: 25,
    });
  });

  it('lists each submission with its owner and a link to review it', async () => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({
      rows: [row(), row({ id: 'd'.repeat(24), title: '', ownerUsername: null })],
      total: 2,
    });

    await open();

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'Bus poem' })).toHaveAttribute(
      'href',
      `/admin/community/${ID}`
    );
    expect(rows[0]).toHaveTextContent('fan');
    expect(rows[1]).toHaveTextContent('Untitled');
  });

  it('says the queue is clear when nothing awaits approval', async () => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [], total: 0 });

    await open();

    expect(screen.getByText('Nothing is awaiting approval.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers the next page while there is more, keeping the queue', async () => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [row()], total: 60 });

    await open({ status: 'approved', page: '2' });

    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/admin/community?status=approved&page=3'
    );
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/admin/community?status=approved&page=1'
    );
  });

  it('offers no paging when everything fits on one page', async () => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [row()], total: 1 });

    await open();

    expect(screen.queryByRole('link', { name: 'Next page' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Previous page' })).not.toBeInTheDocument();
  });

  it('links an admin to the managers screen', async () => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [], total: 0 });

    await open({}, 'admin');

    expect(screen.getByRole('link', { name: 'Managers' })).toHaveAttribute(
      'href',
      '/admin/community/managers'
    );
  });

  it('shows a manager no link to the managers screen', async () => {
    vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [], total: 0 });

    await open({}, 'manager');

    expect(screen.queryByRole('link', { name: 'Managers' })).not.toBeInTheDocument();
  });

  describe('the Reported tab', () => {
    it('is a tab beside the queues', async () => {
      vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [], total: 0 });

      await open();

      expect(screen.getByRole('link', { name: 'Reported' })).toHaveAttribute(
        'href',
        '/admin/community?status=reported&page=1'
      );
    });

    it('carries how many submissions this approver has to look at, when there are any', async () => {
      vi.mocked(SubmissionService.listQueue).mockResolvedValueOnce({ rows: [], total: 0 });
      vi.mocked(SubmissionReportService.countReported).mockResolvedValueOnce(3);

      await open({}, 'manager');

      expect(screen.getByRole('link', { name: 'Reported (3)' })).toBeInTheDocument();
      expect(vi.mocked(SubmissionReportService.countReported).mock.calls).toEqual([
        [{ id: USER_ID, role: 'manager' }],
      ]);
    });

    it('reads ?status=reported as the reported submissions, for this approver', async () => {
      vi.mocked(SubmissionReportService.listReported).mockResolvedValueOnce({
        rows: [reportedRow()],
        total: 1,
      });

      await open({ status: 'reported', page: '2' }, 'manager');

      expect(vi.mocked(SubmissionReportService.listReported).mock.calls).toEqual([
        [
          { id: USER_ID, role: 'manager' },
          { skip: 25, take: 25 },
        ],
      ]);
      expect(SubmissionService.listQueue).not.toHaveBeenCalled();
      expect(screen.getByRole('link', { name: 'Reported (1)' })).toHaveAttribute(
        'aria-current',
        'page'
      );
    });

    it('takes its count from the page it read, without counting twice', async () => {
      vi.mocked(SubmissionReportService.listReported).mockResolvedValueOnce({
        rows: [reportedRow()],
        total: 1,
      });

      await open({ status: 'reported' });

      expect(SubmissionReportService.countReported).not.toHaveBeenCalled();
    });

    it('lists each reported submission with its state, open reports and oldest report', async () => {
      vi.mocked(SubmissionReportService.listReported).mockResolvedValueOnce({
        rows: [
          reportedRow(),
          reportedRow({
            id: 'd'.repeat(24),
            title: '',
            ownerUsername: null,
            status: 'AWAITING_APPROVAL',
            openReports: 1,
          }),
        ],
        total: 2,
      });

      await open({ status: 'reported' });

      const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
      expect(
        within(rows[0] as HTMLElement).getByRole('link', { name: 'Bus poem' })
      ).toHaveAttribute('href', `/admin/community/${ID}`);
      expect(
        within(rows[0] as HTMLElement)
          .getAllByRole('cell')
          .slice(2)
          .map((cell) => cell.textContent)
      ).toEqual(['fan', 'Approved', '2', 'Nov 2, 2026']);
      expect(
        within(rows[1] as HTMLElement)
          .getAllByRole('cell')
          .slice(1)
          .map((cell) => cell.textContent)
      ).toEqual(['Untitled', 'No username', 'Awaiting approval', '1', 'Nov 2, 2026']);
    });

    it('says so when no submission has an open report', async () => {
      await open({ status: 'reported' });

      expect(screen.getByText('No submission has an open report.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Reported' })).toHaveAttribute(
        'aria-current',
        'page'
      );
    });

    it('pages through the reported submissions, keeping the tab', async () => {
      vi.mocked(SubmissionReportService.listReported).mockResolvedValueOnce({
        rows: [reportedRow()],
        total: 60,
      });

      await open({ status: 'reported', page: '2' });

      expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
        'href',
        '/admin/community?status=reported&page=3'
      );
    });
  });
});

describe('ReviewSubmissionPage', () => {
  it('shows the submission and offers the decision on what was loaded', async () => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver('manager'));
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(view());

    render(await ReviewSubmissionPage(params()));

    expect(screen.getByTestId('view')).toHaveAttribute('data-title', 'Bus poem');
    const decision = screen.getByTestId('decision');
    expect(decision).toHaveAttribute('data-id', ID);
    expect(decision).toHaveAttribute('data-status', 'AWAITING_APPROVAL');
    expect(decision).toHaveAttribute('data-loaded', WHEN.toISOString());
    expect(vi.mocked(SubmissionService.getForViewer).mock.calls).toEqual([
      [ID, { id: USER_ID, role: 'manager' }],
    ]);
    expect(vi.mocked(requireApprover).mock.calls).toEqual([['approver']]);
  });

  it('offers no Report control: the decision is right there', async () => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver('manager'));
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(
      view({ status: 'APPROVED', isPublic: true })
    );

    render(await ReviewSubmissionPage(params()));

    expect(screen.getByTestId('view')).toHaveAttribute('data-reportable', 'false');
  });

  it('lists the reports this approver may read, under the decision', async () => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver('manager'));
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(view());
    vi.mocked(SubmissionReportService.listForSubmission).mockResolvedValueOnce([
      reportView(),
      reportView({ id: 'f'.repeat(24), note: 'That is my photo.' }),
    ]);

    render(await ReviewSubmissionPage(params()));

    expect(screen.getByTestId('reports')).toHaveAttribute(
      'data-notes',
      'Threats in the about.|That is my photo.'
    );
    expect(vi.mocked(SubmissionReportService.listForSubmission).mock.calls).toEqual([
      [
        { id: ID, ownerId: 'b'.repeat(24) },
        { id: USER_ID, role: 'manager' },
      ],
    ]);
  });

  it.each([
    ['a submission nobody has reported', []],
    ['a manager on their own submission, who is kept from its reports', null],
  ])('shows no reports for %s', async (_name, reports) => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver('manager'));
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(view());
    vi.mocked(SubmissionReportService.listForSubmission).mockResolvedValueOnce(reports);

    render(await ReviewSubmissionPage(params()));

    expect(screen.queryByTestId('reports')).not.toBeInTheDocument();
  });

  it.each([
    ['a submission that does not exist', null],
    ['a draft, which is not in any queue', view({ status: 'DRAFT', viewer: 'owner' })],
  ])('answers not found for %s', async (_name, found) => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver('admin'));
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(found);

    await expect(ReviewSubmissionPage(params())).rejects.toThrow('NOT_FOUND');
  });

  it('answers not found for an id that cannot be one, without asking the service', async () => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver('admin'));

    await expect(ReviewSubmissionPage(params('nope'))).rejects.toThrow('NOT_FOUND');
    expect(SubmissionService.getForViewer).not.toHaveBeenCalled();
  });
});

describe('ManagersPage', () => {
  it('asks for admin access, which a manager does not hold', async () => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver('admin'));
    vi.mocked(ManagerService.list).mockResolvedValueOnce([]);

    render(await ManagersPage());

    expect(vi.mocked(requireApprover).mock.calls).toEqual([['admin']]);
  });

  it('hands the managers to the controls', async () => {
    vi.mocked(requireApprover).mockResolvedValueOnce(approver('admin'));
    vi.mocked(ManagerService.list).mockResolvedValueOnce([
      { id: 'm1', username: 'street_team' },
      { id: 'm2', username: 'merch_table' },
    ]);

    render(await ManagersPage());

    expect(screen.getByTestId('managers')).toHaveAttribute('data-names', 'street_team,merch_table');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Managers');
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import type { SubmissionView } from '@/lib/types/domain/submission';

import { SubmissionViewContent } from './submission-view';

vi.mock('./submission-share', () => ({
  SubmissionShare: ({ submissionId, title }: { submissionId: string; title: string }) => (
    <div data-testid="share" data-id={submissionId} data-title={title} />
  ),
}));
vi.mock('./submission-owner-controls', () => ({
  SubmissionOwnerControls: ({ submissionId }: { submissionId: string }) => (
    <div data-testid="owner-controls" data-id={submissionId} />
  ),
}));

const ID = 'c'.repeat(24);
const HARDENED = 'nofollow noopener noreferrer';

const view = (overrides: Partial<SubmissionView> = {}): SubmissionView => ({
  id: ID,
  ownerId: 'a'.repeat(24),
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '<p>Written on the <strong>bus</strong>.</p>',
  writingHtml: '<h2>Stanza</h2><p>A poem.</p>',
  links: ['https://example.com/zine', 'https://bandcamp.com/fan'],
  listed: true,
  status: 'APPROVED',
  rejectionReason: null,
  publishedAt: new Date('2026-11-01T09:00:00.000Z'),
  updatedAt: new Date('2026-11-02T09:00:00.000Z'),
  owner: { username: 'fan', gravatarHash: 'abc123' },
  viewer: 'public',
  isPublic: true,
  queuePosition: null,
  attachments: [],
  ...overrides,
});

describe('SubmissionViewContent', () => {
  it('heads the page with the title', () => {
    render(<SubmissionViewContent view={view()} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bus poem');
  });

  it('names an untitled draft as untitled', () => {
    render(<SubmissionViewContent view={view({ title: '', status: 'DRAFT', viewer: 'owner' })} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Untitled');
  });

  it('credits the owner by username and names the category', () => {
    render(<SubmissionViewContent view={view()} />);

    expect(screen.getByText('fan')).toBeInTheDocument();
    expect(screen.getByText('Writings (lyrics, poetry, prose, and blurbs)')).toBeInTheDocument();
  });

  it('renders the about and the writing with their formatting', () => {
    render(<SubmissionViewContent view={view()} />);

    expect(screen.getByText('bus').tagName).toBe('STRONG');
    expect(screen.getByRole('heading', { level: 2, name: 'Stanza' })).toBeInTheDocument();
    expect(screen.getByText('A poem.')).toBeInTheDocument();
  });

  it('lists each outbound link, hardened and in a new tab', () => {
    render(<SubmissionViewContent view={view()} />);

    const links = within(screen.getByRole('list', { name: 'Links' })).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/zine',
      'https://bandcamp.com/fan',
    ]);
    expect(links.map((link) => [link.getAttribute('rel'), link.getAttribute('target')])).toEqual([
      [HARDENED, '_blank'],
      [HARDENED, '_blank'],
    ]);
  });

  it('shows no links list when there are none', () => {
    render(<SubmissionViewContent view={view({ links: [] })} />);

    expect(screen.queryByRole('list', { name: 'Links' })).not.toBeInTheDocument();
  });

  it('offers sharing on a public submission', () => {
    render(<SubmissionViewContent view={view()} />);

    expect(screen.getByTestId('share')).toHaveAttribute('data-id', ID);
  });

  it.each(['DRAFT', 'AWAITING_APPROVAL', 'REJECTED'] as const)(
    'offers no sharing on a %s submission',
    (status) => {
      render(<SubmissionViewContent view={view({ status, viewer: 'owner', isPublic: false })} />);

      expect(screen.queryByTestId('share')).not.toBeInTheDocument();
    }
  );

  it('shows a member of the public no status and no controls', () => {
    render(<SubmissionViewContent view={view()} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('owner-controls')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review this submission' })).not.toBeInTheDocument();
  });

  it('shows the owner the status and their controls', () => {
    render(<SubmissionViewContent view={view({ viewer: 'owner' })} />);

    expect(screen.getByRole('status')).toHaveTextContent('Approved and listed.');
    expect(screen.getByTestId('owner-controls')).toHaveAttribute('data-id', ID);
  });

  it('shows an approver the status and a link to review it, but not the owner’s controls', () => {
    render(
      <SubmissionViewContent
        view={view({ viewer: 'approver', status: 'AWAITING_APPROVAL', isPublic: false })}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Awaiting approval.');
    expect(screen.getByRole('link', { name: 'Review this submission' })).toHaveAttribute(
      'href',
      `/admin/community/${ID}`
    );
    expect(screen.queryByTestId('owner-controls')).not.toBeInTheDocument();
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { AnnouncementHistory, type AnnouncementHistoryItem } from './announcement-history';

const baseItem: AnnouncementHistoryItem = {
  id: 'blast-1',
  message: 'Doors at 8, see you there!',
  sentByEmail: 'admin@example.com',
  recipientCount: 15,
  sentCount: 12,
  failedCount: 0,
  createdAt: '2026-06-01T12:00:00.000Z',
};

describe('AnnouncementHistory', () => {
  it('shows the history section heading', () => {
    render(<AnnouncementHistory blasts={[]} />);

    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no announcements', () => {
    render(<AnnouncementHistory blasts={[]} />);

    expect(screen.getByText('No announcements sent yet.')).toBeInTheDocument();
  });

  it('renders the announcement message', () => {
    render(<AnnouncementHistory blasts={[baseItem]} />);

    expect(screen.getByText('Doors at 8, see you there!')).toBeInTheDocument();
  });

  it('renders the sender email', () => {
    render(<AnnouncementHistory blasts={[baseItem]} />);

    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
  });

  it('renders the sent count', () => {
    render(<AnnouncementHistory blasts={[baseItem]} />);

    expect(screen.getByText('12 sent')).toBeInTheDocument();
  });

  it('does not render a failure indicator when nothing failed', () => {
    render(<AnnouncementHistory blasts={[baseItem]} />);

    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it('renders the failure count when sends failed', () => {
    render(<AnnouncementHistory blasts={[{ ...baseItem, failedCount: 3 }]} />);

    expect(screen.getByText('3 failed')).toBeInTheDocument();
  });
});

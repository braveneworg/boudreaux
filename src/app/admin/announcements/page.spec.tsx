/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import type { SmsBlastRecord } from '@/lib/types/domain';

import AnnouncementsPage from './page';

import type { AnnouncementHistoryItem } from './components/announcement-history';

vi.mock('server-only', () => ({}));

const mockGetRecipientCount = vi.fn();
const mockGetRecentBlasts = vi.fn();
vi.mock('@/lib/services/sms-blast-service', () => ({
  SmsBlastService: {
    getRecipientCount: () => mockGetRecipientCount(),
    getRecentBlasts: (limit: number) => mockGetRecentBlasts(limit),
  },
}));

let composeProps: { recipientCount: number } | undefined;
vi.mock('./components/announcement-compose-form', () => ({
  AnnouncementComposeForm: (props: { recipientCount: number }) => {
    composeProps = props;
    return <div data-testid="compose-form" />;
  },
}));

let historyProps: { blasts: AnnouncementHistoryItem[] } | undefined;
vi.mock('./components/announcement-history', () => ({
  AnnouncementHistory: (props: { blasts: AnnouncementHistoryItem[] }) => {
    historyProps = props;
    return <ul data-testid="history" />;
  },
}));

const blastRecord: SmsBlastRecord = {
  id: 'b1',
  message: 'Hello world',
  sentById: 'u1',
  sentByEmail: 'a@b.com',
  recipientCount: 8,
  sentCount: 8,
  failedCount: 0,
  createdAt: new Date('2026-06-01T12:00:00.000Z'),
};

describe('AnnouncementsPage', () => {
  beforeEach(() => {
    composeProps = undefined;
    historyProps = undefined;
    mockGetRecipientCount.mockResolvedValue({ success: true, data: 8 });
    mockGetRecentBlasts.mockResolvedValue({ success: true, data: [blastRecord] });
  });

  it('renders the Announcements heading', async () => {
    render(await AnnouncementsPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Announcements' })).toBeInTheDocument();
  });

  it('passes the recipient count to the compose form', async () => {
    render(await AnnouncementsPage());

    expect(composeProps).toEqual({ recipientCount: 8 });
  });

  it('requests the twenty most recent blasts', async () => {
    render(await AnnouncementsPage());

    expect(mockGetRecentBlasts).toHaveBeenCalledWith(20);
  });

  it('serialises the blast history for the history list', async () => {
    render(await AnnouncementsPage());

    expect(historyProps?.blasts).toEqual([
      {
        id: 'b1',
        message: 'Hello world',
        sentByEmail: 'a@b.com',
        recipientCount: 8,
        sentCount: 8,
        failedCount: 0,
        createdAt: '2026-06-01T12:00:00.000Z',
      },
    ]);
  });

  it('degrades to zero recipients when the count service fails', async () => {
    mockGetRecipientCount.mockResolvedValue({ success: false, error: 'boom' });

    render(await AnnouncementsPage());

    expect(composeProps).toEqual({ recipientCount: 0 });
  });

  it('degrades to an empty history when the blast service fails', async () => {
    mockGetRecentBlasts.mockResolvedValue({ success: false, error: 'boom' });

    render(await AnnouncementsPage());

    expect(historyProps?.blasts).toEqual([]);
  });
});

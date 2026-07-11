/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactElement } from 'react';

import { Heading } from '@/app/components/ui/heading';
import { formatTourDate } from '@/lib/utils/date-utils';

/**
 * Serialized SMS blast history row. `createdAt` is an ISO string so the record
 * can cross the server/client boundary from the Announcements page.
 */
export interface AnnouncementHistoryItem {
  id: string;
  message: string;
  sentByEmail: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

interface AnnouncementHistoryProps {
  blasts: AnnouncementHistoryItem[];
}

/**
 * Presentational history of past SMS blasts, newest first. Rendered by the
 * server Announcements page — holds no state and fires no effects.
 */
export const AnnouncementHistory = ({ blasts }: AnnouncementHistoryProps): ReactElement => (
  <section className="space-y-4">
    <Heading level={2}>History</Heading>

    {blasts.length === 0 ? (
      <p className="text-muted-foreground text-sm">No announcements sent yet.</p>
    ) : (
      <ul className="space-y-3">
        {blasts.map((blast) => (
          <li key={blast.id} className="space-y-1 border-2 border-black bg-white/60 p-4">
            <p className="text-muted-foreground text-sm">{formatTourDate(blast.createdAt)}</p>
            <p className="line-clamp-3">{blast.message}</p>
            <p className="text-muted-foreground text-sm">{blast.sentByEmail}</p>
            <p className="text-sm">{`${blast.sentCount} sent`}</p>
            {blast.failedCount > 0 && (
              <p className="text-destructive text-sm">{`${blast.failedCount} failed`}</p>
            )}
          </li>
        ))}
      </ul>
    )}
  </section>
);

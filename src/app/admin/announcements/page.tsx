/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MessageSquareText } from 'lucide-react';

import { SectionHeader } from '@/app/components/ui/section-header';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { SmsBlastService } from '@/lib/services/sms-blast-service';
import type { SmsBlastRecord } from '@/lib/types/domain';

import { AnnouncementComposeForm } from './components/announcement-compose-form';
import { AnnouncementHistory } from './components/announcement-history';

import type { AnnouncementHistoryItem } from './components/announcement-history';

/** Serialize a blast record for the client (Date → ISO string). */
const toHistoryItem = (blast: SmsBlastRecord): AnnouncementHistoryItem => ({
  id: blast.id,
  message: blast.message,
  sentByEmail: blast.sentByEmail,
  recipientCount: blast.recipientCount,
  sentCount: blast.sentCount,
  failedCount: blast.failedCount,
  createdAt: blast.createdAt.toISOString(),
});

/**
 * Admin Announcements page: compose and send an SMS blast to every opted-in
 * subscriber, with a recipient-count preview and a history of past blasts.
 * A failed service response degrades gracefully — the page still renders with
 * zero recipients and no history. Admin auth is enforced by the admin layout.
 */
export default async function AnnouncementsPage() {
  const [countResult, blastsResult] = await Promise.all([
    SmsBlastService.getRecipientCount(),
    SmsBlastService.getRecentBlasts(20),
  ]);

  const recipientCount = countResult.success ? countResult.data : 0;
  const blasts = blastsResult.success ? blastsResult.data.map(toHistoryItem) : [];

  return (
    <ZinePanel
      accent="storm"
      tape={false}
      contentClassName="space-y-6"
      breadcrumbs={[
        { anchorText: 'Admin', url: '/admin', isActive: false },
        { anchorText: 'Announcements', url: '/admin/announcements', isActive: true },
      ]}
    >
      <SectionHeader
        icon={MessageSquareText}
        title="Announcements"
        helpText="Compose and send a text to every SMS-opted-in subscriber."
      />

      <AnnouncementComposeForm recipientCount={recipientCount} />

      <AnnouncementHistory blasts={blasts} />
    </ZinePanel>
  );
}

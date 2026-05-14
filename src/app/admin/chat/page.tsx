/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Heading } from '@/app/components/ui/heading';

import { ChatUsersTable } from './chat-users-table';

export default function AdminChatPage() {
  return (
    <div className="container mx-auto">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Chat', url: '/admin/chat', isActive: true },
        ]}
      />

      <div className="mt-4 mb-4">
        <Heading level={1} className="h-auto">
          Chat Moderation
        </Heading>
      </div>

      <p className="text-zinc-950-foreground mb-4 px-6">
        Review chat activity, flag abusive senders, and disable accounts that violate community
        guidelines. Disabled users cannot send new messages or react until re-enabled here.
      </p>

      <ChatUsersTable />
    </div>
  );
}

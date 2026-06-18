/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { MessageSquare } from 'lucide-react';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { SectionHeader } from '@/app/components/ui/section-header';

import { ChatModerationTabs } from './chat-moderation-tabs';

export default function AdminChatPage() {
  return (
    <div className="space-y-6">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Chat', url: '/admin/chat', isActive: true },
        ]}
      />

      <SectionHeader
        icon={MessageSquare}
        title="Chat Moderation"
        helpText="Review chat activity, flag abusive senders, and disable accounts that violate community guidelines. Disabled users cannot send messages or react until re-enabled here."
      />

      <ChatModerationTabs />
    </div>
  );
}

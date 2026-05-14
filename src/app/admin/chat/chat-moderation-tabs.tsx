/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { ChatUsersTable } from './chat-users-table';
import { ReportedUsersTable } from './reported-users-table';

type ModerationView = 'reported' | 'all';

/**
 * Top-level filter for the chat moderation page. Defaults to the
 * "Reported users" view per the abuse-reporting feature spec, with a
 * dropdown to switch to "All users" for general moderation.
 */
export const ChatModerationTabs = () => {
  const [view, setView] = useState<ModerationView>('reported');

  return (
    <div className="space-y-4 px-6">
      <div className="flex items-center gap-3">
        <label htmlFor="moderation-view" className="text-muted-foreground text-sm">
          View
        </label>
        <Select value={view} onValueChange={(value) => setView(value as ModerationView)}>
          <SelectTrigger id="moderation-view" className="w-56">
            <SelectValue placeholder="Select view" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reported">Reported users</SelectItem>
            <SelectItem value="all">All users</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {view === 'reported' ? <ReportedUsersTable /> : <ChatUsersTable />}
    </div>
  );
};

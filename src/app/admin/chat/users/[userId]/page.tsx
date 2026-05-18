/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { notFound } from 'next/navigation';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Heading } from '@/app/components/ui/heading';
import { prisma } from '@/lib/prisma';

import { UserDetailView } from './user-detail-view';

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function AdminChatUserPage({ params }: PageProps) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      phone: true,
      chatUsers: { select: { disabled: true } },
    },
  });
  if (!user) notFound();

  const chatDisabled = user.chatUsers.some((cu) => cu.disabled);

  return (
    <div className="container mx-auto">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Chat', url: '/admin/chat', isActive: false },
          {
            anchorText: user.username ?? user.email,
            url: `/admin/chat/users/${userId}`,
            isActive: true,
          },
        ]}
      />

      <div className="mt-4 mb-4 px-6">
        <Heading level={1} className="h-auto">
          {user.username ?? user.email}
        </Heading>
        <dl className="text-muted-foreground mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-medium">Email</dt>
          <dd className="text-foreground break-all">{user.email}</dd>
          <dt className="font-medium">Username</dt>
          <dd className="text-foreground">{user.username ?? '—'}</dd>
          <dt className="font-medium">Phone</dt>
          <dd className="text-foreground">{user.phone ?? '—'}</dd>
        </dl>
      </div>

      <div className="px-6">
        <UserDetailView userId={userId} initialChatDisabled={chatDisabled} />
      </div>
    </div>
  );
}

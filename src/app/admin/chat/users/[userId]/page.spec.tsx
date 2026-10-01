/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';
import { UserRepository } from '@/lib/repositories/user-repository';

import AdminChatUserPage from './page';

vi.mock('server-only', () => ({}));

const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

vi.mock('@/lib/repositories/user-repository');
vi.mock('@/lib/repositories/chat-user-repository');

vi.mock('@/app/components/ui/zine-panel', () => ({
  ZinePanel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="zine-panel">{children}</div>
  ),
}));

vi.mock('./user-detail-view', () => ({
  UserDetailView: ({
    userId,
    initialChatDisabled,
  }: {
    userId: string;
    initialChatDisabled: boolean;
  }) => (
    <div
      data-testid="user-detail-view"
      data-user-id={userId}
      data-chat-disabled={String(initialChatDisabled)}
    />
  ),
}));

const USER_ID = '507f1f77bcf86cd799439011';
const user = { id: USER_ID, email: 'fan@example.com', username: 'fan', phone: null };

const renderPage = async () => {
  const page = await AdminChatUserPage({ params: Promise.resolve({ userId: USER_ID }) });
  return render(page);
};

describe('AdminChatUserPage', () => {
  beforeEach(() => {
    vi.mocked(UserRepository.findById).mockResolvedValue(user as never);
    vi.mocked(ChatUserRepository.findByUserId).mockResolvedValue(null);
  });

  it('loads the user through the repository by id', async () => {
    await renderPage();

    expect(vi.mocked(UserRepository.findById).mock.calls).toEqual([[USER_ID]]);
  });

  it('calls notFound when the user does not exist', async () => {
    vi.mocked(UserRepository.findById).mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('shows the username as the heading', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('fan');
  });

  it('falls back to the email when the user has no username', async () => {
    vi.mocked(UserRepository.findById).mockResolvedValue({ ...user, username: null } as never);

    await renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('fan@example.com');
  });

  it('passes chat-disabled=false when the user has no chat account', async () => {
    await renderPage();

    expect(screen.getByTestId('user-detail-view')).toHaveAttribute('data-chat-disabled', 'false');
  });

  it('passes chat-disabled=true when the chat account is disabled', async () => {
    vi.mocked(ChatUserRepository.findByUserId).mockResolvedValue({ disabled: true } as never);

    await renderPage();

    expect(screen.getByTestId('user-detail-view')).toHaveAttribute('data-chat-disabled', 'true');
  });
});

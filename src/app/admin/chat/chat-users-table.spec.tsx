// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { updateChatUserAction } from '@/lib/actions/update-chat-user-action';

import { ChatUsersTable } from './chat-users-table';

const useChatAdminUsersQueryMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/use-chat-admin-users-query', () => ({
  useChatAdminUsersQuery: (params: unknown) => useChatAdminUsersQueryMock(params),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/update-chat-user-action', () => ({
  updateChatUserAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const sampleRow = {
  id: 'cu-1',
  userId: 'user-1',
  username: 'octo',
  email: 'octo@example.com',
  fingerprint: 'fp',
  ipAddress: '203.0.113.5',
  messageCount: 42,
  flagged: false,
  disabled: false,
  lastSeenAt: '2026-05-01T12:00:00Z',
  createdAt: '2026-04-01T12:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChatUsersTable', () => {
  it('renders a loading spinner while the query is pending', () => {
    useChatAdminUsersQueryMock.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    });

    render(<ChatUsersTable />);

    expect(screen.getByLabelText('Loading chat users')).toBeInTheDocument();
  });

  it('renders an error state when the query fails', () => {
    useChatAdminUsersQueryMock.mockReturnValue({
      isPending: false,
      isError: true,
      data: undefined,
    });

    render(<ChatUsersTable />);

    expect(screen.getByText(/could not load chat users/i)).toBeInTheDocument();
  });

  it('renders an empty-state row when there are no chat users', () => {
    useChatAdminUsersQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: { rows: [], total: 0, page: 1, perPage: 50 },
    });

    render(<ChatUsersTable />);

    expect(screen.getByText(/no chat users yet/i)).toBeInTheDocument();
  });

  it('renders one row per chat user with the expected columns', () => {
    useChatAdminUsersQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: { rows: [sampleRow], total: 1, page: 1, perPage: 50 },
    });

    render(<ChatUsersTable />);

    expect(screen.getByText('octo')).toBeInTheDocument();
    expect(screen.getByText('octo@example.com')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('shows a flagged icon and Clear flag button on flagged rows only', () => {
    useChatAdminUsersQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        rows: [
          { ...sampleRow, id: 'cu-1', userId: 'u-1', flagged: true },
          { ...sampleRow, id: 'cu-2', userId: 'u-2', username: 'cat', flagged: false },
        ],
        total: 2,
        page: 1,
        perPage: 50,
      },
    });

    render(<ChatUsersTable />);

    expect(screen.getByLabelText('Flagged for review')).toBeInTheDocument();
    const clearButtons = screen.getAllByRole('button', { name: /clear flag/i });
    expect(clearButtons).toHaveLength(1);
  });

  it('toggles disabled via the action and shows a success toast', async () => {
    useChatAdminUsersQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: { rows: [sampleRow], total: 1, page: 1, perPage: 50 },
    });
    vi.mocked(updateChatUserAction).mockResolvedValue({ success: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatUsersTable />);
    await user.click(screen.getByRole('switch'));

    await waitFor(() =>
      expect(updateChatUserAction).toHaveBeenCalledWith({ userId: 'user-1', disabled: true })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/disabled/i))
    );
    expect(invalidateQueriesMock).toHaveBeenCalled();
  });

  it('clears a flag via the action and refreshes the cache', async () => {
    useChatAdminUsersQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        rows: [{ ...sampleRow, flagged: true }],
        total: 1,
        page: 1,
        perPage: 50,
      },
    });
    vi.mocked(updateChatUserAction).mockResolvedValue({ success: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatUsersTable />);
    await user.click(screen.getByRole('button', { name: /clear flag/i }));

    await waitFor(() =>
      expect(updateChatUserAction).toHaveBeenCalledWith({ userId: 'user-1', clearFlag: true })
    );
    expect(invalidateQueriesMock).toHaveBeenCalled();
  });

  it('surfaces an error toast when the action fails', async () => {
    useChatAdminUsersQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: { rows: [sampleRow], total: 1, page: 1, perPage: 50 },
    });
    vi.mocked(updateChatUserAction).mockResolvedValue({ success: false, error: 'unauthorized' });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatUsersTable />);
    await user.click(screen.getByRole('switch'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});

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

  it('surfaces an error toast when clearing a flag fails', async () => {
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
    vi.mocked(updateChatUserAction).mockResolvedValue({ success: false, error: 'unauthorized' });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatUsersTable />);
    await user.click(screen.getByRole('button', { name: /clear flag/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not clear flag/i))
    );
  });

  it('renders a dash for a missing username and an unparseable last-seen date', () => {
    useChatAdminUsersQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        rows: [{ ...sampleRow, username: null, lastSeenAt: 'not-a-date' }],
        total: 1,
        page: 1,
        perPage: 50,
      },
    });

    render(<ChatUsersTable />);

    // username fallback (—) and timestamp fallback (—) both render.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('restores chat access (disabled=false) for an already-disabled user', async () => {
    useChatAdminUsersQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        rows: [{ ...sampleRow, username: null, disabled: true }],
        total: 1,
        page: 1,
        perPage: 50,
      },
    });
    vi.mocked(updateChatUserAction).mockResolvedValue({ success: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatUsersTable />);
    // aria-label uses 'Enable' + falls back to email when username is null.
    await user.click(screen.getByRole('switch', { name: /enable chat for octo@example.com/i }));

    await waitFor(() =>
      expect(updateChatUserAction).toHaveBeenCalledWith({ userId: 'user-1', disabled: false })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/restored/i))
    );
  });

  describe('pagination', () => {
    it('renders pagination controls and advances to the next page', async () => {
      useChatAdminUsersQueryMock.mockReturnValue({
        isPending: false,
        isError: false,
        data: { rows: [sampleRow], total: 120, page: 1, perPage: 50 },
      });
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

      render(<ChatUsersTable />);

      const previous = screen.getByRole('button', { name: /previous/i });
      const next = screen.getByRole('button', { name: /next/i });
      expect(previous).toBeDisabled();
      await user.click(next);

      await waitFor(() =>
        expect(useChatAdminUsersQueryMock).toHaveBeenCalledWith(
          expect.objectContaining({ page: 2 })
        )
      );
    });

    it('returns to the previous page from a later page', async () => {
      useChatAdminUsersQueryMock.mockReturnValue({
        isPending: false,
        isError: false,
        data: { rows: [sampleRow], total: 120, page: 1, perPage: 50 },
      });
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

      render(<ChatUsersTable />);

      await user.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled());
      await user.click(screen.getByRole('button', { name: /previous/i }));

      await waitFor(() => expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled());
    });
  });
});

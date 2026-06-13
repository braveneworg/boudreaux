/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { AbuseReportRepository } from '@/lib/repositories/abuse-report-repository';
import { BannedIdentityRepository } from '@/lib/repositories/banned-identity-repository';
import { ChatMessageRepository } from '@/lib/repositories/chat-message-repository';
import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';

import { ChatAdminService, MAX_PER_PAGE } from './chat-admin-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/chat-user-repository', () => ({
  ChatUserRepository: {
    findManyPaginated: vi.fn(),
    count: vi.fn(),
    setDisabled: vi.fn(),
    setFlagged: vi.fn(),
    disableWithAudit: vi.fn(),
    enableWithAudit: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/abuse-report-repository', () => ({
  AbuseReportRepository: {
    listReportedUsers: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/chat-message-repository', () => ({
  ChatMessageRepository: {
    hideAsAdminFlagged: vi.fn(),
    unhide: vi.fn(),
    findByUserIdForAdmin: vi.fn(),
    findVisibleIdsByUser: vi.fn(),
    hideAllByUserAsAdminFlagged: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/banned-identity-repository', () => ({
  BannedIdentityRepository: {
    create: vi.fn(),
    unban: vi.fn(),
  },
}));

const sampleRow = {
  id: 'cu-1',
  userId: 'user-1',
  user: { id: 'user-1', username: 'octo', email: 'octo@example.com' },
  fingerprint: 'fp-abc',
  ipAddress: '203.0.113.5',
  messageCount: 12,
  flagged: false,
  disabled: false,
  lastSeenAt: new Date('2026-05-01T12:00:00Z'),
  createdAt: new Date('2026-04-01T12:00:00Z'),
};

describe('ChatAdminService.listChatUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a paginated, shaped result with username/email joined', async () => {
    vi.mocked(ChatUserRepository.findManyPaginated).mockResolvedValue([sampleRow] as never);
    vi.mocked(ChatUserRepository.count).mockResolvedValue(1);

    const result = await ChatAdminService.listChatUsers({
      page: 1,
      perPage: 50,
      sortBy: 'messageCount',
      sortDirection: 'desc',
    });

    expect(ChatUserRepository.findManyPaginated).toHaveBeenCalledWith({
      skip: 0,
      take: 50,
      sortBy: 'messageCount',
      sortDirection: 'desc',
    });
    expect(result.rows[0].username).toBe('octo');
    expect(result.rows[0].email).toBe('octo@example.com');
    expect(result.total).toBe(1);
  });

  it('computes skip from the requested page and perPage', async () => {
    vi.mocked(ChatUserRepository.findManyPaginated).mockResolvedValue([] as never);
    vi.mocked(ChatUserRepository.count).mockResolvedValue(120);

    await ChatAdminService.listChatUsers({
      page: 3,
      perPage: 50,
      sortBy: 'lastSeenAt',
      sortDirection: 'asc',
    });

    expect(ChatUserRepository.findManyPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 50 })
    );
  });

  it('clamps perPage to MAX_PER_PAGE', async () => {
    vi.mocked(ChatUserRepository.findManyPaginated).mockResolvedValue([] as never);
    vi.mocked(ChatUserRepository.count).mockResolvedValue(0);

    await ChatAdminService.listChatUsers({
      page: 1,
      perPage: MAX_PER_PAGE + 500,
      sortBy: 'messageCount',
      sortDirection: 'desc',
    });

    expect(ChatUserRepository.findManyPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ take: MAX_PER_PAGE })
    );
  });

  it('clamps page to a minimum of 1', async () => {
    vi.mocked(ChatUserRepository.findManyPaginated).mockResolvedValue([] as never);
    vi.mocked(ChatUserRepository.count).mockResolvedValue(0);

    const result = await ChatAdminService.listChatUsers({
      page: 0,
      perPage: 50,
      sortBy: 'messageCount',
      sortDirection: 'desc',
    });

    expect(result.page).toBe(1);
    expect(ChatUserRepository.findManyPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 })
    );
  });
});

describe('ChatAdminService.setDisabled', () => {
  it('delegates to the repository with the parent userId', async () => {
    vi.mocked(ChatUserRepository.setDisabled).mockResolvedValue({} as never);

    await ChatAdminService.setDisabled('user-1', true);

    expect(ChatUserRepository.setDisabled).toHaveBeenCalledWith('user-1', true);
  });
});

describe('ChatAdminService.clearFlag', () => {
  it('clears the abuse flag for the given userId', async () => {
    vi.mocked(ChatUserRepository.setFlagged).mockResolvedValue({} as never);

    await ChatAdminService.clearFlag('user-1');

    expect(ChatUserRepository.setFlagged).toHaveBeenCalledWith('user-1', false);
  });
});

describe('ChatAdminService.disableChatUser', () => {
  it('forwards userId, adminId, and reason to the audit-aware repository call', async () => {
    vi.mocked(ChatUserRepository.disableWithAudit).mockResolvedValue({} as never);

    await ChatAdminService.disableChatUser({
      userId: 'user-1',
      adminId: 'admin-7',
      reason: 'spam',
    });

    expect(ChatUserRepository.disableWithAudit).toHaveBeenCalledWith({
      userId: 'user-1',
      adminId: 'admin-7',
      reason: 'spam',
    });
  });

  it('passes reason as undefined when not provided', async () => {
    vi.mocked(ChatUserRepository.disableWithAudit).mockResolvedValue({} as never);

    await ChatAdminService.disableChatUser({ userId: 'user-2', adminId: 'admin-7' });

    expect(ChatUserRepository.disableWithAudit).toHaveBeenCalledWith({
      userId: 'user-2',
      adminId: 'admin-7',
      reason: undefined,
    });
  });
});

describe('ChatAdminService.enableChatUser', () => {
  it('delegates to the repository enableWithAudit', async () => {
    vi.mocked(ChatUserRepository.enableWithAudit).mockResolvedValue({} as never);

    await ChatAdminService.enableChatUser('user-1');

    expect(ChatUserRepository.enableWithAudit).toHaveBeenCalledWith('user-1');
  });
});

describe('ChatAdminService.listReportedUsers', () => {
  const makeSummary = (id: string, username: string, email: string) => ({
    userId: id,
    username,
    email,
    reportCount: 1,
    latestReportedAt: new Date('2026-01-01'),
    chatDisabled: false,
  });

  it('defaults to all-time (windowDays: null) and returns a paginated shape', async () => {
    vi.mocked(AbuseReportRepository.listReportedUsers).mockResolvedValue([]);

    const result = await ChatAdminService.listReportedUsers();

    expect(AbuseReportRepository.listReportedUsers).toHaveBeenCalledWith({ windowDays: null });
    expect(result).toEqual({ rows: [], nextSkip: null });
  });

  it('forwards an explicit windowDays value', async () => {
    vi.mocked(AbuseReportRepository.listReportedUsers).mockResolvedValue([]);

    await ChatAdminService.listReportedUsers({ windowDays: 7 });

    expect(AbuseReportRepository.listReportedUsers).toHaveBeenCalledWith({ windowDays: 7 });
  });

  it('filters by a case-insensitive username/email search term', async () => {
    vi.mocked(AbuseReportRepository.listReportedUsers).mockResolvedValue([
      makeSummary('u1', 'Spammer', 'spam@example.com'),
      makeSummary('u2', 'Goodie', 'good@example.com'),
    ]);

    const result = await ChatAdminService.listReportedUsers({ search: 'SPAM' });

    expect(result.rows.map((r) => r.userId)).toEqual(['u1']);
  });

  it('slices to the requested page and reports the next offset', async () => {
    vi.mocked(AbuseReportRepository.listReportedUsers).mockResolvedValue([
      makeSummary('u1', 'a', 'a@example.com'),
      makeSummary('u2', 'b', 'b@example.com'),
      makeSummary('u3', 'c', 'c@example.com'),
    ]);

    const result = await ChatAdminService.listReportedUsers({ skip: 0, take: 2 });

    expect(result.rows.map((r) => r.userId)).toEqual(['u1', 'u2']);
    expect(result.nextSkip).toBe(2);
  });

  it('returns nextSkip null on the last page', async () => {
    vi.mocked(AbuseReportRepository.listReportedUsers).mockResolvedValue([
      makeSummary('u1', 'a', 'a@example.com'),
      makeSummary('u2', 'b', 'b@example.com'),
    ]);

    const result = await ChatAdminService.listReportedUsers({ skip: 2, take: 2 });

    expect(result.rows).toEqual([]);
    expect(result.nextSkip).toBeNull();
  });
});

describe('ChatAdminService.hideMessage / unhideMessage', () => {
  it('hideMessage forwards messageId and adminId', async () => {
    vi.mocked(ChatMessageRepository.hideAsAdminFlagged).mockResolvedValue({} as never);

    await ChatAdminService.hideMessage({ messageId: 'msg-1', adminId: 'admin-7' });

    expect(ChatMessageRepository.hideAsAdminFlagged).toHaveBeenCalledWith({
      messageId: 'msg-1',
      adminId: 'admin-7',
    });
  });

  it('unhideMessage forwards the messageId', async () => {
    vi.mocked(ChatMessageRepository.unhide).mockResolvedValue({} as never);

    await ChatAdminService.unhideMessage('msg-2');

    expect(ChatMessageRepository.unhide).toHaveBeenCalledWith('msg-2');
  });
});

describe('ChatAdminService.listUserMessages', () => {
  it('forwards pagination params for the admin detail view', async () => {
    vi.mocked(ChatMessageRepository.findByUserIdForAdmin).mockResolvedValue([] as never);

    await ChatAdminService.listUserMessages({ userId: 'user-1', skip: 20, take: 10 });

    expect(ChatMessageRepository.findByUserIdForAdmin).toHaveBeenCalledWith({
      userId: 'user-1',
      skip: 20,
      take: 10,
    });
  });
});

describe('ChatAdminService.banIdentity', () => {
  it('forwards all fields verbatim when present', async () => {
    vi.mocked(BannedIdentityRepository.create).mockResolvedValue({} as never);

    await ChatAdminService.banIdentity({
      userId: 'user-1',
      email: 'baduser@example.com',
      fingerprintHash: 'fp-hash',
      adminId: 'admin-7',
      reason: 'evading prior ban',
    });

    expect(BannedIdentityRepository.create).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'baduser@example.com',
      fingerprintHash: 'fp-hash',
      bannedByAdminId: 'admin-7',
      reason: 'evading prior ban',
    });
  });

  it('coerces missing userId / fingerprintHash / reason to null', async () => {
    vi.mocked(BannedIdentityRepository.create).mockResolvedValue({} as never);

    await ChatAdminService.banIdentity({
      email: 'baduser@example.com',
      adminId: 'admin-7',
    });

    expect(BannedIdentityRepository.create).toHaveBeenCalledWith({
      userId: null,
      email: 'baduser@example.com',
      fingerprintHash: null,
      bannedByAdminId: 'admin-7',
      reason: null,
    });
  });
});

describe('ChatAdminService.unbanIdentity', () => {
  it('delegates to the repository unban with the ban id', async () => {
    vi.mocked(BannedIdentityRepository.unban).mockResolvedValue({} as never);

    await ChatAdminService.unbanIdentity('ban-1');

    expect(BannedIdentityRepository.unban).toHaveBeenCalledWith('ban-1');
  });
});

describe('ChatAdminService.hideAllMessagesByUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an empty list and skips the bulk update when the user has no visible messages', async () => {
    vi.mocked(ChatMessageRepository.findVisibleIdsByUser).mockResolvedValue([] as never);

    const result = await ChatAdminService.hideAllMessagesByUser({
      userId: 'user-1',
      adminId: 'admin-1',
    });

    expect(result).toEqual([]);
    expect(ChatMessageRepository.hideAllByUserAsAdminFlagged).not.toHaveBeenCalled();
  });

  it('snapshots ids first, then hides them in bulk', async () => {
    vi.mocked(ChatMessageRepository.findVisibleIdsByUser).mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
    ] as never);
    vi.mocked(ChatMessageRepository.hideAllByUserAsAdminFlagged).mockResolvedValue({
      count: 2,
    } as never);

    const result = await ChatAdminService.hideAllMessagesByUser({
      userId: 'user-1',
      adminId: 'admin-1',
    });

    expect(result).toEqual(['a', 'b']);
    expect(ChatMessageRepository.hideAllByUserAsAdminFlagged).toHaveBeenCalledWith({
      userId: 'user-1',
      adminId: 'admin-1',
    });
  });
});

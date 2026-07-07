/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const findSmsOptedInUsersMock = vi.fn();
const countSmsOptedInMock = vi.fn();
const createBlastMock = vi.fn();
const findRecentMock = vi.fn();
const smsSendMock = vi.fn();
const getSmsServiceMock = vi.fn(() => ({ send: smsSendMock }));

vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: {
    findSmsOptedInUsers: findSmsOptedInUsersMock,
    countSmsOptedIn: countSmsOptedInMock,
  },
}));

vi.mock('@/lib/repositories/sms-blast-repository', () => ({
  SmsBlastRepository: {
    create: createBlastMock,
    findRecent: findRecentMock,
  },
}));

vi.mock('@/lib/services/get-sms-service', () => ({
  getSmsService: getSmsServiceMock,
}));

const { loggers } = await import('@/lib/utils/logger');
const { SmsBlastService, sendInChunks, SMS_BLAST_CHUNK_SIZE } = await import('./sms-blast-service');

const baseInput = { message: 'Hello fans!', sentById: 'admin-1', sentByEmail: 'admin@example.com' };

const makeBlastRecord = (overrides?: object) => ({
  id: 'blast-1',
  message: 'Hello fans!\n\nhttps://fakefourrecords.com/profile',
  sentById: 'admin-1',
  sentByEmail: 'admin@example.com',
  recipientCount: 1,
  sentCount: 1,
  failedCount: 0,
  createdAt: new Date(),
  ...overrides,
});

describe('SmsBlastService', () => {
  beforeEach(() => {
    findSmsOptedInUsersMock.mockReset();
    countSmsOptedInMock.mockReset();
    createBlastMock.mockReset();
    findRecentMock.mockReset();
    smsSendMock.mockReset();
    getSmsServiceMock.mockClear();
  });

  describe('sendBlast', () => {
    it('returns failure and does not create a record when no opted-in users', async () => {
      findSmsOptedInUsersMock.mockResolvedValue([]);

      const result = await SmsBlastService.sendBlast(baseInput);

      expect(result.success).toBe(false);
      expect(createBlastMock).not.toHaveBeenCalled();
    });

    it('excludes whitespace-only phone recipients from recipientCount and sends', async () => {
      findSmsOptedInUsersMock.mockResolvedValue([
        { id: 'u1', phone: ' ' },
        { id: 'u2', phone: '+15551234567' },
      ]);
      smsSendMock.mockResolvedValue({ ok: true, messageId: 'msg-1' });
      createBlastMock.mockResolvedValue(makeBlastRecord({ recipientCount: 1, sentCount: 1 }));

      const result = await SmsBlastService.sendBlast(baseInput);

      expect(smsSendMock).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ success: true, data: { recipientCount: 1 } });
    });

    it('counts correctly and calls create with exact counts and finalMessage on all-success', async () => {
      findSmsOptedInUsersMock.mockResolvedValue([
        { id: 'u1', phone: '+15551111111' },
        { id: 'u2', phone: '+15552222222' },
      ]);
      smsSendMock.mockResolvedValue({ ok: true, messageId: 'msg-ok' });
      createBlastMock.mockResolvedValue(
        makeBlastRecord({ recipientCount: 2, sentCount: 2, failedCount: 0 })
      );

      const result = await SmsBlastService.sendBlast(baseInput);

      expect(result.success).toBe(true);
      expect(createBlastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientCount: 2,
          sentCount: 2,
          failedCount: 0,
          message: expect.stringMatching(/\/profile$/),
        })
      );
    });

    it('normalizes US phone numbers to E.164 before sending', async () => {
      findSmsOptedInUsersMock.mockResolvedValue([{ id: 'u1', phone: '(555) 123-4567' }]);
      smsSendMock.mockResolvedValue({ ok: true, messageId: 'msg-1' });
      createBlastMock.mockResolvedValue(makeBlastRecord());

      await SmsBlastService.sendBlast(baseInput);

      expect(smsSendMock).toHaveBeenCalledWith('+15551234567', expect.any(String), {
        transactional: false,
      });
    });

    it('falls back to raw phone value when number cannot be normalized', async () => {
      findSmsOptedInUsersMock.mockResolvedValue([{ id: 'u1', phone: 'garbage' }]);
      smsSendMock.mockResolvedValue({ ok: true, messageId: 'msg-1' });
      createBlastMock.mockResolvedValue(makeBlastRecord());

      await SmsBlastService.sendBlast(baseInput);

      expect(smsSendMock).toHaveBeenCalledWith('garbage', expect.any(String), {
        transactional: false,
      });
    });

    it('counts {ok:false} and rejected sends as failures; all recipients still attempted', async () => {
      findSmsOptedInUsersMock.mockResolvedValue([
        { id: 'u1', phone: '+15550000001' },
        { id: 'u2', phone: '+15550000002' },
        { id: 'u3', phone: '+15550000003' },
      ]);
      smsSendMock
        .mockResolvedValueOnce({ ok: false, error: 'rate limited' })
        .mockRejectedValueOnce(new Error('SNS down'))
        .mockResolvedValueOnce({ ok: true, messageId: 'msg-3' });
      createBlastMock.mockResolvedValue(
        makeBlastRecord({ recipientCount: 3, sentCount: 1, failedCount: 2 })
      );

      const result = await SmsBlastService.sendBlast(baseInput);

      expect(smsSendMock).toHaveBeenCalledTimes(3);
      expect(result).toMatchObject({
        success: true,
        data: { sentCount: 1, failedCount: 2, recipientCount: 3 },
      });
    });

    it('returns failure with the standard message when SmsBlastRepository.create throws', async () => {
      findSmsOptedInUsersMock.mockResolvedValue([{ id: 'u1', phone: '+15551234567' }]);
      smsSendMock.mockResolvedValue({ ok: true, messageId: 'msg-1' });
      createBlastMock.mockRejectedValue(new Error('DB write failed'));

      const result = await SmsBlastService.sendBlast(baseInput);

      expect(result).toMatchObject({ success: false, error: 'Failed to send SMS blast' });
    });

    it('logs userId on failure but never logs the phone number', async () => {
      const warnSpy = vi.spyOn(loggers.notifications, 'warn').mockImplementation(() => {});
      findSmsOptedInUsersMock.mockResolvedValue([{ id: 'user-secret-id', phone: '+15559876543' }]);
      smsSendMock.mockResolvedValue({ ok: false, error: 'blocked' });
      createBlastMock.mockResolvedValue(makeBlastRecord({ sentCount: 0, failedCount: 1 }));

      await SmsBlastService.sendBlast(baseInput);

      expect(warnSpy).toHaveBeenCalled();
      // userId must appear in the data arg
      const dataArgs = warnSpy.mock.calls.map(([, data]) => data);
      expect(dataArgs.some((d) => d?.userId === 'user-secret-id')).toBe(true);
      // phone must never appear anywhere in warn call args
      const serialized = JSON.stringify(warnSpy.mock.calls);
      expect(serialized).not.toContain('+15559876543');
      warnSpy.mockRestore();
    });
  });

  describe('getRecipientCount', () => {
    it('returns the count from the repository on success', async () => {
      countSmsOptedInMock.mockResolvedValue(42);

      const result = await SmsBlastService.getRecipientCount();

      expect(result).toEqual({ success: true, data: 42 });
    });

    it('returns failure when the repository throws', async () => {
      countSmsOptedInMock.mockRejectedValue(new Error('DB error'));

      const result = await SmsBlastService.getRecipientCount();

      expect(result.success).toBe(false);
    });
  });

  describe('getRecentBlasts', () => {
    it('returns recent blast records from the repository on success', async () => {
      const blasts = [makeBlastRecord()];
      findRecentMock.mockResolvedValue(blasts);

      const result = await SmsBlastService.getRecentBlasts(5);

      expect(result).toEqual({ success: true, data: blasts });
    });

    it('returns failure when the repository throws', async () => {
      findRecentMock.mockRejectedValue(new Error('DB error'));

      const result = await SmsBlastService.getRecentBlasts(5);

      expect(result.success).toBe(false);
    });
  });
});

describe('sendInChunks', () => {
  beforeEach(() => {
    smsSendMock.mockReset();
  });

  it('calls send for all 25 recipients across 3 chunks when delayMs is 0', async () => {
    const recipients = Array.from({ length: 25 }, (_, i) => ({
      id: `u${i}`,
      phone: `+1555000${String(i).padStart(4, '0')}`,
    }));
    smsSendMock.mockResolvedValue({ ok: true, messageId: 'msg' });
    const sms = { send: smsSendMock };

    const { sentCount, failedCount } = await sendInChunks(
      sms as Parameters<typeof sendInChunks>[0],
      recipients,
      'Test message\n\nhttps://fakefourrecords.com/profile',
      0
    );

    expect(smsSendMock).toHaveBeenCalledTimes(25);
    expect(sentCount).toBe(25);
    expect(failedCount).toBe(0);
  });

  it('caps max concurrent sends per chunk at SMS_BLAST_CHUNK_SIZE', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    smsSendMock.mockImplementation(async () => {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      await Promise.resolve();
      inFlight--;
      return { ok: true, messageId: 'msg' };
    });
    const recipients = Array.from({ length: 25 }, (_, i) => ({
      id: `u${i}`,
      phone: `+1555000${String(i).padStart(4, '0')}`,
    }));
    const sms = { send: smsSendMock };

    await sendInChunks(
      sms as Parameters<typeof sendInChunks>[0],
      recipients,
      'Test message\n\nhttps://fakefourrecords.com/profile',
      0
    );

    expect(maxInFlight).toBe(SMS_BLAST_CHUNK_SIZE);
  });

  it('calls setTimeout exactly (chunkCount - 1) times with delayMs between chunks', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    smsSendMock.mockResolvedValue({ ok: true, messageId: 'msg' });
    const recipients = Array.from({ length: 25 }, (_, i) => ({
      id: `u${i}`,
      phone: `+1555000${String(i).padStart(4, '0')}`,
    }));
    const sms = { send: smsSendMock };

    await sendInChunks(
      sms as Parameters<typeof sendInChunks>[0],
      recipients,
      'Test message\n\nhttps://fakefourrecords.com/profile',
      5
    );

    const timedCalls = setTimeoutSpy.mock.calls.filter((args) => args[1] === 5);
    expect(timedCalls).toHaveLength(2); // 3 chunks → 2 inter-chunk gaps
    setTimeoutSpy.mockRestore();
  });

  it('does not call setTimeout when delayMs is 0 (sleep short-circuits)', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    smsSendMock.mockResolvedValue({ ok: true, messageId: 'msg' });
    const recipients = Array.from({ length: 25 }, (_, i) => ({
      id: `u${i}`,
      phone: `+1555000${String(i).padStart(4, '0')}`,
    }));
    const sms = { send: smsSendMock };

    await sendInChunks(
      sms as Parameters<typeof sendInChunks>[0],
      recipients,
      'Test message\n\nhttps://fakefourrecords.com/profile',
      0
    );

    const zeroCalls = setTimeoutSpy.mock.calls.filter((args) => args[1] === 0);
    expect(zeroCalls).toHaveLength(0);
    setTimeoutSpy.mockRestore();
  });
});

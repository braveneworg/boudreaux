/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { sendChatMentionEmail } from './send-chat-mention';

vi.mock('server-only', () => ({}));

const mockSesClientSend = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/ses-client', () => ({
  sesClient: { send: mockSesClientSend },
}));

vi.mock('./chat-mention-email-html', () => ({
  buildChatMentionEmailHtml: vi.fn().mockReturnValue('<html>mention</html>'),
}));

vi.mock('./chat-mention-email-text', () => ({
  buildChatMentionEmailText: vi.fn().mockReturnValue('mention text'),
}));

const mockSendMail = vi.hoisted(() => vi.fn());
const mockCreateTransport = vi.hoisted(() => vi.fn());

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
}));

const mockSendRawEmailParams = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-ses', () => ({
  SendRawEmailCommand: class MockSendRawEmailCommand {
    input: unknown;
    constructor(params: unknown) {
      mockSendRawEmailParams(params);
      this.input = params;
    }
  },
}));

describe('sendChatMentionEmail', () => {
  const validInput = {
    toEmail: 'recipient@example.com',
    recipientUsername: 'recipient',
    authorUsername: 'author',
    messageBody: 'Hello @recipient',
  };

  beforeEach(() => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com');
    mockSesClientSend.mockResolvedValue({});
    mockSendMail.mockResolvedValue({ message: Buffer.from('raw-mime-message') });
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('returns false and logs when EMAIL_FROM is not configured', async () => {
    vi.stubEnv('EMAIL_FROM', '');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendChatMentionEmail(validInput);

    expect(result).toBe(false);
    expect(mockSesClientSend).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('EMAIL_FROM is not configured'));
    errorSpy.mockRestore();
  });

  it('sends raw email via SES and returns true on success', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const result = await sendChatMentionEmail(validInput);

    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@fakefourrecords.com',
        to: 'recipient@example.com',
        subject: expect.stringContaining('author mentioned you'),
        html: '<html>mention</html>',
        text: 'mention text',
      })
    );
    expect(mockSendRawEmailParams).toHaveBeenCalledWith(
      expect.objectContaining({
        Source: 'noreply@fakefourrecords.com',
        Destinations: ['recipient@example.com'],
        RawMessage: { Data: expect.any(Buffer) },
      })
    );
    expect(mockSesClientSend).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Email sent to recipient@example.com')
    );
    infoSpy.mockRestore();
  });

  it('builds the sign-in URL with NEXT_PUBLIC_BASE_URL', async () => {
    await sendChatMentionEmail(validInput);

    const { buildChatMentionEmailHtml } = await import('./chat-mention-email-html');
    expect(buildChatMentionEmailHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        signInUrl: expect.stringContaining('https://example.com/signin?callbackUrl='),
      })
    );
  });

  it('falls back to the default base URL when NEXT_PUBLIC_BASE_URL is not set', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    delete process.env.NEXT_PUBLIC_BASE_URL;

    await sendChatMentionEmail(validInput);

    const { buildChatMentionEmailHtml } = await import('./chat-mention-email-html');
    expect(buildChatMentionEmailHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        signInUrl: expect.stringContaining('https://fakefourrecords.com/signin'),
      })
    );
  });

  it('attaches the logo image with the expected CID', async () => {
    await sendChatMentionEmail(validInput);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: 'fake-four-inc-black-hand-logo.svg',
            cid: 'logo@fakefourrecords.com',
            contentType: 'image/svg+xml',
          }),
        ]),
      })
    );
  });

  it('throws when SES dispatch fails', async () => {
    mockSesClientSend.mockRejectedValueOnce(new Error('SES down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendChatMentionEmail(validInput)).rejects.toThrow('SES down');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send chat mention email'),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { sendSubmissionEmail } from './send-submission-email';

vi.mock('server-only', () => ({}));

const mockSesClientSend = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/ses-client', () => ({
  sesClient: { send: mockSesClientSend },
}));

const mockSendMail = vi.hoisted(() => vi.fn());
const mockCreateTransport = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
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

const email = {
  toEmail: 'fan@example.com',
  subject: 'Approved: Bus poem',
  text: 'plain',
  html: '<html>rich</html>',
};

const RAW = Buffer.from('raw-mime-message');

describe('sendSubmissionEmail', () => {
  beforeEach(() => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    mockSesClientSend.mockReset();
    mockSendMail.mockReset();
    mockCreateTransport.mockReset();
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockSendMail.mockResolvedValue({ message: RAW });
    mockSesClientSend.mockResolvedValue({});
  });

  it('composes the message from the sender address to the recipient', async () => {
    await sendSubmissionEmail(email);

    expect(mockSendMail.mock.calls).toEqual([
      [
        {
          from: 'noreply@fakefourrecords.com',
          to: 'fan@example.com',
          subject: 'Approved: Bus poem',
          text: 'plain',
          html: '<html>rich</html>',
        },
      ],
    ]);
  });

  it('sends the composed message through SES once and answers true', async () => {
    await expect(sendSubmissionEmail(email)).resolves.toBe(true);

    expect(mockSendRawEmailParams.mock.calls).toEqual([
      [
        {
          Source: 'noreply@fakefourrecords.com',
          Destinations: ['fan@example.com'],
          RawMessage: { Data: RAW },
        },
      ],
    ]);
    expect(mockSesClientSend).toHaveBeenCalledTimes(1);
  });

  it('answers false and sends nothing when no sender address is configured', async () => {
    vi.stubEnv('EMAIL_FROM', '');

    await expect(sendSubmissionEmail(email)).resolves.toBe(false);
    expect(mockSesClientSend).not.toHaveBeenCalled();
  });

  it('rejects with the SES failure, for the caller to log per recipient', async () => {
    const outage = new Error('SES down');
    mockSesClientSend.mockRejectedValue(outage);

    await expect(sendSubmissionEmail(email)).rejects.toBe(outage);
  });
});

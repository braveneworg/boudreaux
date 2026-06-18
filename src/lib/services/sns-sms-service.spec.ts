/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

import { SnsSmsService, buildSnsSmsServiceFromEnv } from './sns-sms-service';

vi.mock('server-only', () => ({}));

const sendMock = vi.fn();
vi.mock('@aws-sdk/client-sns', () => {
  class ClientCtor {
    send = sendMock;
  }
  class CommandCtor {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  return {
    SNSClient: vi.fn(ClientCtor) as unknown,
    PublishCommand: vi.fn(CommandCtor) as unknown,
  };
});

const SNSClientCtor = vi.mocked(SNSClient);
const PublishCommandCtor = vi.mocked(PublishCommand);

describe('SnsSmsService', () => {
  beforeEach(() => {
    sendMock.mockReset();
    SNSClientCtor.mockClear();
    PublishCommandCtor.mockClear();
  });

  it('publishes with Transactional SMSType by default', async () => {
    sendMock.mockResolvedValue({ MessageId: 'msg-123' });
    const service = new SnsSmsService({ region: 'us-east-1' });

    const result = await service.send('+15551234567', 'hello');

    expect(result).toEqual({ ok: true, messageId: 'msg-123' });
    expect(PublishCommandCtor).toHaveBeenCalledWith({
      PhoneNumber: '+15551234567',
      Message: 'hello',
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
      },
    });
  });

  it('publishes Promotional when transactional=false', async () => {
    sendMock.mockResolvedValue({ MessageId: 'msg-1' });
    const service = new SnsSmsService({ region: 'us-east-1' });

    await service.send('+15551234567', 'hi', { transactional: false });

    const lastCallInput = PublishCommandCtor.mock.calls[0]?.[0] as
      | { MessageAttributes: Record<string, { StringValue: string }> }
      | undefined;
    expect(lastCallInput?.MessageAttributes['AWS.SNS.SMS.SMSType']?.StringValue).toBe(
      'Promotional'
    );
  });

  it('attaches the origination number when configured', async () => {
    sendMock.mockResolvedValue({ MessageId: 'msg-1' });
    const service = new SnsSmsService({
      region: 'us-east-1',
      originationNumber: '+18005551212',
    });

    await service.send('+15551234567', 'hi');

    const lastCallInput = PublishCommandCtor.mock.calls[0]?.[0] as
      | { MessageAttributes: Record<string, { StringValue: string }> }
      | undefined;
    expect(lastCallInput?.MessageAttributes['AWS.MM.SMS.OriginationNumber']?.StringValue).toBe(
      '+18005551212'
    );
  });

  it('returns ok:false on a network error', async () => {
    sendMock.mockRejectedValue(Error('network down'));
    const service = new SnsSmsService({ region: 'us-east-1' });

    const result = await service.send('+15551234567', 'hi');

    expect(result.ok).toBe(false);
    const error = !result.ok ? result.error : null;
    expect(error).toBe('network down');
  });

  it('returns ok:false when SNS returns no MessageId', async () => {
    sendMock.mockResolvedValue({});
    const service = new SnsSmsService({ region: 'us-east-1' });

    const result = await service.send('+15551234567', 'hi');

    expect(result.ok).toBe(false);
  });

  it('falls back to a generic message on a non-Error rejection', async () => {
    sendMock.mockRejectedValue('boom');
    const service = new SnsSmsService({ region: 'us-east-1' });

    const result = await service.send('+15551234567', 'hi');

    expect(result.ok).toBe(false);
    const error = !result.ok ? result.error : null;
    expect(error).toBe('Unknown SNS error');
  });
});

describe('buildSnsSmsServiceFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads AWS_REGION and SNS_SMS_ORIGINATION_NUMBER from env', () => {
    vi.stubEnv('AWS_REGION', 'us-west-2');
    vi.stubEnv('SNS_SMS_ORIGINATION_NUMBER', '+15551112222');
    const service = buildSnsSmsServiceFromEnv();
    expect(service).toBeInstanceOf(SnsSmsService);
  });

  it('defaults the region to us-east-1 when AWS_REGION is unset', () => {
    vi.stubEnv('AWS_REGION', undefined);
    const service = buildSnsSmsServiceFromEnv();
    expect(service).toBeInstanceOf(SnsSmsService);
    expect(SNSClientCtor).toHaveBeenCalledWith({ region: 'us-east-1' });
  });
});

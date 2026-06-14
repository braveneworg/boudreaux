/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

import type { SmsResult, SmsSendOptions, SmsService } from './sms-service';

interface SnsSmsServiceConfig {
  region: string;
  /**
   * 10DLC long code / toll-free origination identity (E.164 format,
   * e.g. `+15551234567`). Required once Fake Four Inc.'s 10DLC
   * campaign is approved; without it SNS may fall back to a shared
   * shortcode with worse deliverability.
   */
  originationNumber?: string;
}

/**
 * Production SMS provider backed by AWS SNS.
 *
 * Activated by `SMS_PROVIDER=sns` plus AWS credentials available to
 * the runtime (IAM role on EC2 / Lambda execution role — no long-lived
 * keys). Messages are sent with `SMSType=Transactional` so they receive
 * higher delivery priority and are exempt from STOP-keyword tracking
 * (system-to-admin alerts, no end-user opt-in flow).
 *
 * See `docs/auto-generated/010-chat-abuse-reporting-aws-setup.md` for the
 * one-time AWS Support cases (sandbox exit + spend limit) and 10DLC
 * registration steps that must complete before this provider works
 * in production.
 */
export class SnsSmsService implements SmsService {
  private readonly client: SNSClient;
  private readonly originationNumber?: string;

  constructor(config: SnsSmsServiceConfig) {
    this.client = new SNSClient({ region: config.region });
    this.originationNumber = config.originationNumber;
  }

  async send(to: string, body: string, opts?: SmsSendOptions): Promise<SmsResult> {
    const transactional = opts?.transactional ?? true;
    const messageAttributes: Record<string, { DataType: string; StringValue: string }> = {
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: transactional ? 'Transactional' : 'Promotional',
      },
    };
    if (this.originationNumber) {
      messageAttributes['AWS.MM.SMS.OriginationNumber'] = {
        DataType: 'String',
        StringValue: this.originationNumber,
      };
    }

    try {
      const result = await this.client.send(
        new PublishCommand({
          PhoneNumber: to,
          Message: body,
          MessageAttributes: messageAttributes,
        })
      );
      const messageId = result.MessageId ?? '';
      if (!messageId) {
        return { ok: false, error: 'SNS publish returned no MessageId' };
      }
      return { ok: true, messageId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SNS error';
      return { ok: false, error: message };
    }
  }
}

export function buildSnsSmsServiceFromEnv(): SnsSmsService {
  return new SnsSmsService({
    region: process.env.AWS_REGION ?? 'us-east-1',
    originationNumber: process.env.SNS_SMS_ORIGINATION_NUMBER,
  });
}

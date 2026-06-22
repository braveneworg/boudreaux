/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import { sendAbuseReportNotificationEmail } from '@/lib/email/send-abuse-report-notification';
import { UserRepository } from '@/lib/repositories/user-repository';
import { getSmsService } from '@/lib/services/get-sms-service';
import { loggers } from '@/lib/utils/logger';

interface DispatchInput {
  reportedUsername: string;
}

/**
 * Fan out a new-abuse-report alert to every admin user.
 *
 * - **Email**: dispatched to every user with `role: "admin"`.
 * - **SMS**: dispatched only when the admin has `allowSmsNotifications`
 *   true AND a non-empty `phone`. In local/dev the {@link NoOpSmsService}
 *   captures the send instead of hitting AWS.
 *
 * Privacy: reporter identity is intentionally absent from both message
 * bodies. The function does not even accept a reporter parameter.
 */
export const dispatchAbuseReportNotifications = async (input: DispatchInput): Promise<void> => {
  const admins = await UserRepository.findAdmins();

  if (admins.length === 0) {
    loggers.chat.warn(
      '[dispatchAbuseReportNotifications] no admins found; skipping notification fan-out'
    );
    return;
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://fakefourrecords.com';
  const smsBody = `[boudreaux] Abuse report submitted against @${input.reportedUsername}. Log in to review: ${baseUrl}/admin/chat`;
  const sms = getSmsService();

  // Email + SMS run per-admin in parallel; one admin's failure does not
  // block the rest. We deliberately await the full fan-out before
  // returning so Next.js Server Action runtimes don't tear down the
  // process mid-dispatch.
  await Promise.allSettled(
    admins.map(async (admin) => {
      const recipientUsername = admin.username ?? admin.email.split('@')[0];

      const emailPromise = sendAbuseReportNotificationEmail({
        toEmail: admin.email,
        recipientUsername,
        reportedUsername: input.reportedUsername,
      }).catch((error) => {
        loggers.chat.error(
          `[dispatchAbuseReportNotifications] email failed for ${admin.email}`,
          error
        );
      });

      // Truthy-guard narrows `admin.phone` to a non-null string for `send`.
      const smsPromise =
        admin.allowSmsNotifications && admin.phone
          ? sms
              .send(admin.phone, smsBody, { transactional: true })
              .then((result) => {
                if (!result.ok) {
                  loggers.chat.error(
                    `[dispatchAbuseReportNotifications] SMS failed for admin ${admin.id}: ${result.error}`
                  );
                }
              })
              .catch((error) => {
                loggers.chat.error(
                  `[dispatchAbuseReportNotifications] SMS threw for admin ${admin.id}`,
                  error
                );
              })
          : Promise.resolve();

      await Promise.all([emailPromise, smsPromise]);
    })
  );
};

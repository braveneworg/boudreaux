/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';

import { extractClientIp } from '@/lib/decorators/with-rate-limit';
import { guestIdentityService } from '@/lib/services/guest-identity-service';
import { readGuestVisitorId, setGuestVisitorIdCookie } from '@/lib/utils/guest-visitor-id';
import { computeFingerprintHash } from '@/lib/utils/visitor-fingerprint';
import type { DownloadSubject } from '@/types/download-subject';

/**
 * The download subject (CONTEXT.md) of a request: the signed-in user when
 * there is one, otherwise the guest the cookie and fingerprint resolve to,
 * carrying its visitor-id union and reissuing the cookie when identity
 * resolution asks for it. Runs before any streaming starts so the cookie
 * goes out in the first response bytes.
 */
export const resolveDownloadSubject = async (
  request: NextRequest,
  userId: string | null
): Promise<DownloadSubject> => {
  if (userId !== null) {
    return { kind: 'user', userId };
  }

  const identity = await guestIdentityService.resolveVisitorIdentity({
    cookieValue: await readGuestVisitorId(),
    fingerprintHash: computeFingerprintHash({
      userAgent: request.headers.get('user-agent'),
      acceptLanguage: request.headers.get('accept-language'),
      ip: extractClientIp(request),
    }),
  });
  if (identity.cookieReissue) {
    await setGuestVisitorIdCookie(identity.primaryVisitorId);
  }
  return {
    kind: 'guest',
    visitorId: identity.primaryVisitorId,
    visitorIds: identity.allVisitorIds,
  };
};

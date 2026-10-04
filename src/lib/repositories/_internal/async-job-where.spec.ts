/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { STALE_JOB_MS } from '@/utils/async-job-lifecycle';

import { mayBeginRunWhere } from './async-job-where';

describe('mayBeginRunWhere', () => {
  it('lets a run begin unless the job is processing with a fresh start', () => {
    const now = new Date('2026-10-03T12:00:00.000Z');

    expect(mayBeginRunWhere('bioStatus', 'bioStartedAt', now)).toEqual({
      OR: [
        { bioStatus: { not: 'processing' } },
        { bioStatus: null },
        { bioStatus: { isSet: false } },
        { bioStartedAt: null },
        { bioStartedAt: { isSet: false } },
        { bioStartedAt: { lt: new Date(now.getTime() - STALE_JOB_MS) } },
      ],
    });
  });
});

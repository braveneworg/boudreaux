/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPresent } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * Submission report `where` fragments (ADR-0025, ADR-0028). `handled` is
 * non-null with a default, so "open" is matched by value. `contactEmail` is
 * optional and absent from most reports, so "holds a contact" is spelled with
 * the kit. Proved by `submission-report-where.contract.spec.ts`.
 */
export const submissionReportWhere = {
  /** No approver has marked it handled. */
  open: { handled: false },
  /**
   * Still holds a contact email and was filed before `cutoff`: what the
   * erasure takes the address from.
   */
  contactFiledBefore: (cutoff: Date) => ({
    ...isPresent('contactEmail'),
    createdAt: { lt: cutoff },
  }),
} as const satisfies {
  open: Prisma.SubmissionReportWhereInput;
  contactFiledBefore: (cutoff: Date) => Prisma.SubmissionReportWhereInput;
};

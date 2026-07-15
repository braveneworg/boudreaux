/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written, Prisma-free mirror of the `Producer` model. Drift-checked
 * against `Prisma.ProducerGetPayload` in `video-repository`.
 */
export interface Producer {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Data accepted by the repository to create a producer. */
export interface CreateProducerData {
  name: string;
  createdBy?: string | null;
}

/**
 * Hand-written mirror of the `VideoProducer` join. Drift-checked against
 * `Prisma.VideoProducerGetPayload` in `video-repository`.
 */
export interface VideoProducer {
  id: string;
  videoId: string;
  producerId: string;
  sortOrder: number;
}

/** Lightweight producer shape returned to the admin form (search + pills). */
export interface ProducerSummary {
  id: string;
  name: string;
}

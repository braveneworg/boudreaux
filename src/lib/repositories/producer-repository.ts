/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type { CreateProducerData, ProducerSummary } from '@/lib/types/domain/producer';

import { runQuery } from './_internal/map-prisma-error';

const producerSummarySelect = { id: true, name: true } as const;

/**
 * Data-access layer for the `Producer` model and `VideoProducer` join. The only
 * layer that touches Prisma for producer data; every call is wrapped in
 * `runQuery` so callers see vendor-neutral `DataError`s.
 */
export class ProducerRepository {
  /**
   * Case-insensitive name search for the admin producers combobox.
   * Results ordered by name ascending, capped at `take`.
   */
  static async search(q: string, take: number): Promise<ProducerSummary[]> {
    return runQuery(() =>
      prisma.producer.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take,
        select: producerSummarySelect,
      })
    );
  }

  /**
   * Find a producer by exact (case-insensitive) name, or create it.
   * Recovers from a duplicate-name race by re-finding the winner.
   */
  static async findOrCreateByName(name: string, createdBy?: string): Promise<ProducerSummary> {
    const trimmed = name.trim();
    const existing = await runQuery(() =>
      prisma.producer.findFirst({
        where: { name: { equals: trimmed, mode: 'insensitive' } },
        select: producerSummarySelect,
      })
    );
    if (existing) return existing;

    const data: CreateProducerData = { name: trimmed, createdBy: createdBy ?? null };
    try {
      return await runQuery(() => prisma.producer.create({ data, select: producerSummarySelect }));
    } catch {
      // Unique-name race: another request created the same name first — re-find.
      const recovered = await runQuery(() =>
        prisma.producer.findFirst({
          where: { name: { equals: trimmed, mode: 'insensitive' } },
          select: producerSummarySelect,
        })
      );
      if (recovered) return recovered;
      throw new Error(`Failed to create producer "${trimmed}"`);
    }
  }

  /**
   * Replace a video's producer joins in one transaction: delete the existing
   * rows, then bulk-create the new batch (single `createMany` — never
   * concurrent `create`s, which race Prisma's read-back on fresh collections).
   */
  static async replaceForVideo(videoId: string, producerIds: string[]): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.videoProducer.deleteMany({ where: { videoId } });
        if (producerIds.length > 0) {
          await tx.videoProducer.createMany({
            data: producerIds.map((producerId, sortOrder) => ({ videoId, producerId, sortOrder })),
          });
        }
      })
    );
  }

  /**
   * Producers credited on a video, ordered by `sortOrder` asc.
   * Returns lightweight `ProducerSummary` objects for display.
   */
  static async findByVideoId(videoId: string): Promise<ProducerSummary[]> {
    const rows = await runQuery(() =>
      prisma.videoProducer.findMany({
        where: { videoId },
        orderBy: { sortOrder: 'asc' },
        select: { producer: { select: producerSummarySelect } },
      })
    );
    return rows.map(({ producer }) => producer);
  }
}

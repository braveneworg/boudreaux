/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ProducerRepository } from '@/lib/repositories/producer-repository';
import type { ProducerSummary } from '@/lib/types/domain/producer';

const MIN_SEARCH_LENGTH = 2;
const SEARCH_TAKE = 10;

/** One producer entry from the admin form: an existing id or a new free-text name. */
export interface ProducerInput {
  id?: string;
  name: string;
}

/** Service layer for producer-related business logic. */
export class ProducerService {
  /** Search producers by name for the admin combobox. Returns [] for queries under 2 chars. */
  static async search(query: string): Promise<ProducerSummary[]> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) return [];
    return ProducerRepository.search(trimmed, SEARCH_TAKE);
  }

  /**
   * Resolve the form's producer entries and replace a video's producer joins.
   * Existing ids are kept as-is; entries without an id are created via
   * `findOrCreateByName`. Results are deduped by id before the replace.
   */
  static async syncVideoProducers(
    videoId: string,
    producers: ProducerInput[],
    createdBy?: string
  ): Promise<void> {
    const ids: string[] = [];
    for (const entry of producers) {
      const name = entry.name.trim();
      if (!name) continue;
      const resolved =
        entry.id !== undefined
          ? { id: entry.id, name }
          : await ProducerRepository.findOrCreateByName(name, createdBy);
      if (!ids.includes(resolved.id)) ids.push(resolved.id);
    }
    await ProducerRepository.replaceForVideo(videoId, ids);
  }
}

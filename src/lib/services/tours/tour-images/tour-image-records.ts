/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ImageRepository } from '@/lib/repositories/tours/image-repository';
import { TourDateImageRepository } from '@/lib/repositories/tours/tour-date-image-repository';
import type { TourDateImageScalars, TourImageScalars } from '@/lib/types/tours';

import type { TourImageRecords } from './types';

/** The `TourImage` model's adapter: the owner is the row's `tourId`. */
export const tourImageRecords: TourImageRecords<TourImageScalars> = {
  ownerIdOf: ({ tourId }) => tourId,
  findByOwner: (tourId) => ImageRepository.findByTourId(tourId),
  count: (tourId) => ImageRepository.count(tourId),
  findById: (id) => ImageRepository.findById(id),
  createWithinCap: ({ ownerId, ...fields }, maxImages) =>
    ImageRepository.createWithinCap({ tourId: ownerId, ...fields }, maxImages),
  delete: async (id) => {
    await ImageRepository.delete(id);
  },
  reorder: async (orders) => {
    await ImageRepository.reorderImages(orders);
  },
};

/** The `TourDateImage` model's adapter: the owner is the row's `tourDateId`. */
export const tourDateImageRecords: TourImageRecords<TourDateImageScalars> = {
  ownerIdOf: ({ tourDateId }) => tourDateId,
  findByOwner: (tourDateId) => TourDateImageRepository.findByTourDateId(tourDateId),
  count: (tourDateId) => TourDateImageRepository.count(tourDateId),
  findById: (id) => TourDateImageRepository.findById(id),
  createWithinCap: ({ ownerId, ...fields }, maxImages) =>
    TourDateImageRepository.createWithinCap({ tourDateId: ownerId, ...fields }, maxImages),
  delete: async (id) => {
    await TourDateImageRepository.delete(id);
  },
  reorder: async (orders) => {
    await TourDateImageRepository.reorderImages(orders);
  },
};

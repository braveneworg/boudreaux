/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { BioImageDragPayload, BioLinkDragPayload } from '@/lib/validation/bio-dnd-schema';

/** Palette link payload → insertable bioLink node content. */
export const buildBioLinkContent = (
  payload: BioLinkDragPayload
): { type: 'bioLink'; attrs: { href: string; text: string; external: boolean } } => ({
  type: 'bioLink',
  attrs: { href: payload.url, text: payload.label, external: payload.isExternal },
});

/** Palette image payload → insertable bioFigure node content. */
export const buildBioFigureContent = (
  payload: BioImageDragPayload
): {
  type: 'bioFigure';
  attrs: { src: string; alt: string; title: string | null; attribution: string | null };
} => ({
  type: 'bioFigure',
  attrs: {
    src: payload.url,
    alt: payload.alt,
    title: payload.title,
    attribution: payload.attribution,
  },
});

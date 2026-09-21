/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactElement, ReactNode } from 'react';

/** Classes for the `CommandItem` that wraps a `SearchResultRow`. */
export const SEARCH_RESULT_ITEM_CLASS = 'flex items-center gap-3 px-2 py-1.5';

export interface SearchResultRowProps {
  /** The row's leading image, placeholder tile, or cover — sized by the caller. */
  thumbnail: ReactNode;
  /** The name of the thing being searched for. */
  primary: string;
  /** A muted second line — the artist of a release, the newest release of an artist. */
  secondary?: string | null;
  /** Pinned to the row's end, e.g. an "add" glyph. */
  trailing?: ReactNode;
}

/**
 * The body of a public search dropdown row: thumbnail, then a name over a
 * muted second line. Rendered inside a `CommandItem` carrying
 * `SEARCH_RESULT_ITEM_CLASS`, so every search lists its matches alike.
 */
export const SearchResultRow = ({
  thumbnail,
  primary,
  secondary,
  trailing,
}: SearchResultRowProps): ReactElement => (
  <>
    {thumbnail}
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-medium">{primary}</span>
      {secondary ? <span className="truncate text-xs text-zinc-500">{secondary}</span> : null}
    </span>
    {trailing}
  </>
);

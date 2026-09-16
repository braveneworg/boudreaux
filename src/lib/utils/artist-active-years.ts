/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The lifecycle dates an artist row carries; a band sets `formedOn`, a person `bornOn`/`diedOn`. */
export interface ArtistActiveYearDates {
  formedOn: Date | string | null;
  bornOn: Date | string | null;
  diedOn: Date | string | null;
}

/** Calendar year of a stored UTC-day date, read in UTC so the day never shifts a year back. */
const utcYear = (value: Date | string): number => new Date(value).getUTCFullYear();

/**
 * One-line "active years" summary for an artist listing: `Formed 2004` for a
 * band, `1975–2010` for a lifespan, `b. 1975` / `d. 2010` when only one end is
 * known, or `null` when no lifecycle date is set (so the line can be omitted).
 * A formation date wins over birth dates because it describes the act itself.
 */
export const formatArtistActiveYears = ({
  formedOn,
  bornOn,
  diedOn,
}: ArtistActiveYearDates): string | null => {
  if (formedOn) return `Formed ${utcYear(formedOn)}`;
  if (bornOn && diedOn) return `${utcYear(bornOn)}–${utcYear(diedOn)}`;
  if (bornOn) return `b. ${utcYear(bornOn)}`;
  if (diedOn) return `d. ${utcYear(diedOn)}`;
  return null;
};

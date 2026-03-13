/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TourCard, type TourCardProps } from './tour-card';

export interface TourListProps {
  tours: TourCardProps['tour'][];
}

/**
 * Tour list component rendering a grid of tour cards
 * Server Component - receives tours prop and renders cards
 */
export const TourList = ({ tours }: TourListProps) => {
  if (tours.length === 0) {
    return (
      <div className="flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/5 p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-muted-foreground">No tours found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Check back later for upcoming tour dates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {tours.map((tour) => (
        <TourCard key={tour.id} tour={tour} />
      ))}
    </div>
  );
};

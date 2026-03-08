/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Date formatting utilities for tour displays
 */

/**
 * Format a date as "MMM D, YYYY" (e.g., "Mar 15, 2026")
 */
export function formatTourDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date range for tour display
 * If same day: "Mar 15, 2026"
 * If different days: "Mar 15 - 17, 2026" (same month) or "Mar 15 - Apr 2, 2026" (different months)
 */
export function formatTourDateRange(
  startDate: Date | string,
  endDate?: Date | string | null
): string {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;

  if (!endDate) {
    return formatTourDate(start);
  }

  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  // Check if same day
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  ) {
    return formatTourDate(start);
  }

  // Check if same month and year
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    const startDay = start.getDate();
    const endDay = end.getDate();
    const month = start.toLocaleDateString('en-US', { month: 'short' });
    const year = start.getFullYear();
    return `${month} ${startDay} - ${endDay}, ${year}`;
  }

  // Check if same year
  if (start.getFullYear() === end.getFullYear()) {
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const endDay = end.getDate();
    const year = start.getFullYear();
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  }

  // Different years
  return `${formatTourDate(start)} - ${formatTourDate(end)}`;
}

/**
 * Format time as "h:mm AM/PM" (e.g., "8:00 PM")
 */
export function formatShowTime(time: Date | string): string {
  const t = typeof time === 'string' ? new Date(time) : time;
  return t.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format time range for show display
 * "8:00 PM - 11:00 PM" or just "8:00 PM" if no end time
 */
export function formatShowTimeRange(
  startTime: Date | string,
  endTime?: Date | string | null
): string {
  const formattedStart = formatShowTime(startTime);

  if (!endTime) {
    return formattedStart;
  }

  const formattedEnd = formatShowTime(endTime);
  return `${formattedStart} - ${formattedEnd}`;
}

/**
 * Format full tour date and time display
 * "Mar 15, 2026 · 8:00 PM - 11:00 PM"
 */
export function formatTourDateTime(
  startDate: Date | string,
  endDate: Date | string | null | undefined,
  startTime: Date | string,
  endTime?: Date | string | null
): string {
  const dateStr = formatTourDateRange(startDate, endDate);
  const timeStr = formatShowTimeRange(startTime, endTime);
  return `${dateStr} · ${timeStr}`;
}

/**
 * Check if a tour date is in the past
 */
export function isTourDatePast(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d < new Date();
}

/**
 * Check if a tour date is upcoming (in the future)
 */
export function isTourDateUpcoming(date: Date | string): boolean {
  return !isTourDatePast(date);
}

/**
 * Sort tours by start date (most recent first)
 */
export function sortToursByStartDateDesc<T extends { startDate: Date | string }>(tours: T[]): T[] {
  return [...tours].sort((a, b) => {
    const dateA = typeof a.startDate === 'string' ? new Date(a.startDate) : a.startDate;
    const dateB = typeof b.startDate === 'string' ? new Date(b.startDate) : b.startDate;
    return dateB.getTime() - dateA.getTime();
  });
}

/**
 * Sort tours by start date (oldest first)
 */
export function sortToursByStartDateAsc<T extends { startDate: Date | string }>(tours: T[]): T[] {
  return [...tours].sort((a, b) => {
    const dateA = typeof a.startDate === 'string' ? new Date(a.startDate) : a.startDate;
    const dateB = typeof b.startDate === 'string' ? new Date(b.startDate) : b.startDate;
    return dateA.getTime() - dateB.getTime();
  });
}

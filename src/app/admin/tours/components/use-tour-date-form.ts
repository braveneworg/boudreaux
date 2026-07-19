/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { type FieldValues, useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import { setFormErrors } from '@/lib/utils/forms/set-form-errors';
import { getTimezoneOffsetMinutes, localToUTC, toLocalDateTimeString } from '@/lib/utils/timezone';
import {
  tourDateCreateSchema,
  tourDateUpdateSchema,
  type TourDateCreateInput,
  type TourDateUpdateInput,
} from '@/lib/validation/tours/tour-date-schema';

import {
  useCreateTourDateMutation,
  useUpdateTourDateMutation,
} from '../_hooks/mutations/use-tour-date-mutations';
import { useTourDateImagesQuery } from '../_hooks/use-tour-date-images-query';

/**
 * Local interfaces matching Prisma model shapes.
 * Client components do not import the generated Prisma client types directly.
 */
export interface ArtistFields {
  id: string;
  firstName: string;
  surname: string;
  displayName: string | null;
  [key: string]: unknown;
}

export interface TourDateFields {
  id: string;
  tourId: string;
  startDate: Date;
  endDate: Date | null;
  showStartTime: Date;
  showEndTime: Date | null;
  doorsOpenAt: Date | null;
  venueId: string;
  timeZone?: string | null;
  utcOffset?: number | null;
  ticketsUrl: string | null;
  ticketIconUrl: string | null;
  ticketPrices: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TourDateImageFields {
  id: string;
  tourDateId: string;
  s3Key: string;
  s3Url: string;
  s3Bucket: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  displayOrder: number;
  altText: string | null;
  createdAt: Date;
  uploadedBy: string | null;
}

export type TourDateWithHeadliners = TourDateFields & {
  headliners: Array<{ artistId: string | null; artist?: ArtistFields | null }>;
};

/**
 * Concrete string-based shape of the tour-date form fields. The form works with
 * the raw input strings (datetime-local values, etc.); the resolver coerces them
 * on submit. Sharing this single type keeps the hook's `control`/`getValues`/
 * `setValue` compatible with the section components that consume them.
 */
export interface TourDateFormValues {
  tourId: string;
  startDate: string;
  endDate: string;
  showStartTime: string;
  showEndTime: string;
  doorsOpenAt: string;
  venueId: string;
  ticketsUrl: string;
  ticketIconUrl: string;
  ticketPrices: string;
  notes: string;
  headlinerIds: string[];
  timeZone: string | null;
  utcOffset: string | null;
}

interface UseTourDateFormProps {
  tourId: string;
  tourDate?: TourDateWithHeadliners;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const formatDateTime = (
  date: string | Date,
  storedTimeZone: string | null | undefined,
  storedUtcOffset: number | null | undefined
): string => {
  if (!date) return '';
  const d = new Date(date as string);
  if (storedTimeZone) {
    return toLocalDateTimeString(d, storedTimeZone);
  }
  if (storedUtcOffset != null) {
    const localMs = d.getTime() + storedUtcOffset * 60_000;
    return new Date(localMs).toISOString().slice(0, 16);
  }
  return d.toISOString().slice(0, 16);
};

const formatDate = (date: string | Date): string => {
  if (!date) return '';
  return new Date(date).toISOString().split('T')[0];
};

const emptyFormValues = (tourId: string): TourDateFormValues => ({
  tourId,
  startDate: '',
  endDate: '',
  showStartTime: '',
  showEndTime: '',
  doorsOpenAt: '',
  venueId: '',
  ticketsUrl: '',
  ticketIconUrl: '',
  ticketPrices: '',
  notes: '',
  headlinerIds: [],
  timeZone: null,
  utcOffset: null,
});

const buildEditDateFields = (td: TourDateWithHeadliners) => {
  const tz = td.timeZone;
  const offset = td.utcOffset;
  return {
    startDate: formatDate(td.startDate),
    endDate: td.endDate ? formatDate(td.endDate) : '',
    showStartTime: formatDateTime(td.showStartTime, tz, offset),
    showEndTime: td.showEndTime ? formatDateTime(td.showEndTime, tz, offset) : '',
    doorsOpenAt: td.doorsOpenAt ? formatDateTime(td.doorsOpenAt, tz, offset) : '',
  };
};

const buildEditTextFields = (td: TourDateWithHeadliners) => ({
  venueId: td.venueId || '',
  ticketsUrl: td.ticketsUrl || '',
  ticketIconUrl: td.ticketIconUrl || '',
  ticketPrices: td.ticketPrices || '',
  notes: td.notes || '',
});

const buildEditMetaFields = (td: TourDateWithHeadliners) => ({
  headlinerIds:
    td.headliners?.map((h) => h.artistId).filter((id): id is string => id !== null) ?? [],
  timeZone: td.timeZone ?? null,
  utcOffset: td.utcOffset != null ? String(td.utcOffset) : null,
});

const buildEditFormValues = (td: TourDateWithHeadliners, tourId: string): TourDateFormValues => ({
  tourId,
  ...buildEditDateFields(td),
  ...buildEditTextFields(td),
  ...buildEditMetaFields(td),
});

const normalizeFormValues = (data: Record<string, unknown>): Map<string, unknown> => {
  const values = new Map<string, unknown>();
  Object.entries(data).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    values.set(key, value instanceof Date ? value.toISOString() : value);
  });
  return values;
};

const applyTimezoneConversions = (
  values: Map<string, unknown>,
  rawValues: FieldValues,
  tz: string
): void => {
  const candidates: Array<[string, unknown]> = [
    ['showStartTime', rawValues.showStartTime],
    ['showEndTime', rawValues.showEndTime],
    ['doorsOpenAt', rawValues.doorsOpenAt],
  ];
  for (const [key, raw] of candidates) {
    if (typeof raw === 'string' && raw.includes('T')) {
      values.set(key, localToUTC(raw.slice(0, 16), tz).toISOString());
    }
  }
};

/**
 * Build the server payload from raw form data: omit empties, ISO-encode dates,
 * and — when a timezone is set — convert the local time strings to true UTC.
 */
const buildSubmitPayload = (
  data: Record<string, unknown>,
  rawValues: FieldValues
): Record<string, unknown> => {
  const values = normalizeFormValues(data);
  const tz = rawValues['timeZone'];
  if (typeof tz === 'string' && tz) {
    applyTimezoneConversions(values, rawValues, tz);
  }
  return Object.fromEntries(values);
};

const useTourDateFormReset = (
  form: UseFormReturn<FieldValues>,
  tourDate: TourDateWithHeadliners | undefined,
  tourId: string
): void => {
  const { reset } = form;
  useEffect(() => {
    reset(tourDate ? buildEditFormValues(tourDate, tourId) : emptyFormValues(tourId));
  }, [tourDate, tourId, reset]);
};

const useAutoUtcOffset = (
  form: UseFormReturn<FieldValues>,
  watchedTimeZone: string,
  watchedStartDate: string
): void => {
  useEffect(() => {
    if (!watchedTimeZone) return;
    const refDate = watchedStartDate ? new Date(watchedStartDate) : new Date();
    const offset = getTimezoneOffsetMinutes(watchedTimeZone, refDate);
    form.setValue('utcOffset', String(offset), { shouldDirty: false });
  }, [watchedTimeZone, watchedStartDate, form]);
};

interface UseTourDateImagesStateParams {
  tourId: string;
  tourDate: TourDateWithHeadliners | undefined;
  open: boolean;
  isEditMode: boolean;
}

interface UseTourDateImagesStateReturn {
  tourDateImages: TourDateImageFields[];
  handleImageUploadComplete: () => void;
}

const useTourDateImagesState = ({
  tourId,
  tourDate,
  open,
  isEditMode,
}: UseTourDateImagesStateParams): UseTourDateImagesStateReturn => {
  const [tourDateImages, setTourDateImages] = useState<TourDateImageFields[]>([]);

  // The gated query owns the request (only while the dialog is open for an
  // existing tour date); the effect projects its result into local state, and
  // `refetch` re-pulls after an upload completes.
  const { data: tourDateImagesData, refetch: refetchTourDateImages } = useTourDateImagesQuery(
    tourId,
    tourDate?.id ?? '',
    { enabled: isEditMode && open && !!tourDate?.id }
  );

  useEffect(() => {
    if (tourDateImagesData) {
      setTourDateImages(tourDateImagesData.images);
    }
  }, [tourDateImagesData]);

  const handleImageUploadComplete = useCallback(() => {
    refetchTourDateImages();
  }, [refetchTourDateImages]);

  return { tourDateImages, handleImageUploadComplete };
};

interface UseTourDateSubmitParams {
  form: UseFormReturn<FieldValues>;
  isEditMode: boolean;
  tourDate: TourDateWithHeadliners | undefined;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface UseTourDateSubmitReturn {
  onSubmit: (data: FieldValues) => Promise<void>;
  isSaving: boolean;
}

const useTourDateSubmit = ({
  form,
  isEditMode,
  tourDate,
  onOpenChange,
  onSuccess,
}: UseTourDateSubmitParams): UseTourDateSubmitReturn => {
  const { setError } = form;
  const { createTourDateAsync, isCreatingTourDate } = useCreateTourDateMutation();
  const { updateTourDateAsync, isUpdatingTourDate } = useUpdateTourDateMutation();
  const isSaving = isCreatingTourDate || isUpdatingTourDate;

  const onSubmit = async (data: FieldValues): Promise<void> => {
    try {
      const payload = buildSubmitPayload(data, form.getValues());
      const result =
        isEditMode && tourDate?.id
          ? await updateTourDateAsync({ id: tourDate.id, values: payload as TourDateUpdateInput })
          : await createTourDateAsync(payload as TourDateCreateInput);

      if (result.success) {
        toast.success(
          isEditMode ? 'Tour date updated successfully' : 'Tour date created successfully'
        );
        onOpenChange(false);
        onSuccess?.();
        return;
      }

      const { generalError } = setFormErrors(setError, result);
      toast.error(generalError ?? 'Please fix the form errors');
    } catch (err) {
      console.error('Form submission error:', err);
      toast.error('An unexpected error occurred');
    }
  };

  return { onSubmit, isSaving };
};

/**
 * Custom hook encapsulating all stateful logic for the TourDateForm dialog.
 * Handles form setup, image fetching, timezone auto-compute, and submission.
 */
export const useTourDateForm = ({
  tourId,
  tourDate,
  open,
  onOpenChange,
  onSuccess,
}: UseTourDateFormProps) => {
  const isEditMode = !!tourDate;

  const form = useForm<FieldValues>({
    resolver: zodResolver(isEditMode ? tourDateUpdateSchema : tourDateCreateSchema),
    defaultValues: emptyFormValues(tourId),
  });
  const { control, handleSubmit } = form;

  const watchedValues = form.watch();
  const watchedTimeZone = String(watchedValues.timeZone ?? '');
  const watchedStartDate = String(watchedValues.startDate ?? '');

  useTourDateFormReset(form, tourDate, tourId);
  useAutoUtcOffset(form, watchedTimeZone, watchedStartDate);
  const { tourDateImages, handleImageUploadComplete } = useTourDateImagesState({
    tourId,
    tourDate,
    open,
    isEditMode,
  });
  const { onSubmit, isSaving } = useTourDateSubmit({
    form,
    isEditMode,
    tourDate,
    onOpenChange,
    onSuccess,
  });

  const handleVenueSelect = useCallback(
    (venue: { timeZone?: string | null }) => {
      if (venue.timeZone) {
        form.setValue('timeZone', venue.timeZone, { shouldDirty: true });
      }
    },
    [form]
  );

  return {
    form,
    control,
    handleSubmit,
    isSaving,
    isEditMode,
    tourDateImages,
    handleVenueSelect,
    handleImageUploadComplete,
    onSubmit,
  };
};

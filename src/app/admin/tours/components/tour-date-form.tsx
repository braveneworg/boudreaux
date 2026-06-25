/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { TourDateArtistsSection } from '@/app/admin/tours/components/tour-date-artists-section';
import { TourDateDatetimeSection } from '@/app/admin/tours/components/tour-date-datetime-section';
import { TourDateImageUpload } from '@/app/admin/tours/components/tour-date-image-upload';
import { TourDateTicketingSection } from '@/app/admin/tours/components/tour-date-ticketing-section';
import {
  type TourDateWithHeadliners,
  useTourDateForm,
} from '@/app/admin/tours/components/use-tour-date-form';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';

interface TourDateFormProps {
  tourId: string;
  tourDate?: TourDateWithHeadliners;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const TourDateForm = (props: TourDateFormProps) => {
  const { tourDate, open, onOpenChange } = props;
  const {
    form,
    control,
    handleSubmit,
    isSaving,
    isEditMode,
    tourDateImages,
    handleVenueSelect,
    handleImageUploadComplete,
    onSubmit,
  } = useTourDateForm(props);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-[calc(100vw-1.236rem)] overflow-y-auto px-[0.618rem] py-5 sm:max-w-150 sm:px-[1.618rem]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Tour Date' : 'Add Tour Date'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the details for this show date.'
              : 'Add a new show date for this tour.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={(e) => {
              // Stop the submit event from bubbling through React's synthetic event
              // tree to the parent tour form. Without this, the parent form receives
              // the propagated submit event and fires its own handleSubmit, causing
              // an unwanted tour update + redirect to /admin/tours.
              e.stopPropagation();
              handleSubmit(onSubmit)(e);
            }}
            className="min-w-0 space-y-6"
          >
            <TourDateArtistsSection control={control} tourDate={tourDate} />

            <Separator />

            <TourDateDatetimeSection
              control={control}
              isSaving={isSaving}
              getValues={form.getValues}
              setValue={form.setValue}
              onVenueSelect={handleVenueSelect}
            />

            <Separator />

            <TourDateTicketingSection control={control} />

            <Separator />

            {/* Notes Section */}
            <section className="space-y-4">
              <FormField
                control={control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value || ''}
                        placeholder="Optional notes about this show"
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional notes specific to this show (e.g., special guests, venue details)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            {/* Images Section (edit mode only) */}
            {isEditMode && tourDate?.id && (
              <>
                <Separator />
                <section className="space-y-4">
                  <h4 className="text-sm font-semibold">Images</h4>
                  <TourDateImageUpload
                    tourDateId={tourDate.id}
                    initialImages={tourDateImages}
                    onUploadComplete={handleImageUploadComplete}
                    disabled={isSaving}
                  />
                </section>
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Add Tour Date'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

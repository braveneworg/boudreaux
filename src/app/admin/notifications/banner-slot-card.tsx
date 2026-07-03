/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useActionState, useCallback, useState } from 'react';

import Image from 'next/image';

import { Loader2, Save, Trash2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { DatePicker } from '@/app/components/ui/datepicker';
import {
  useDeleteBannerNotificationMutation,
  useUpsertBannerNotificationMutation,
} from '@/app/hooks/mutations/use-banner-mutations';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BANNER_CDN_PATH } from '@/lib/constants/banner-slots';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { cn } from '@/lib/utils';
import { isDarkColor } from '@/lib/utils/color';
import {
  addLinkAttributes,
  sanitizeNotificationHtml,
  type BannerNotificationFormData,
} from '@/lib/validation/banner-notification-schema';

import { NotificationSearch } from './notification-search';

export interface BannerSlotFormData {
  slotNumber: number;
  imageFilename: string;
  notification: {
    id: string;
    content: string | null;
    textColor: string | null;
    backgroundColor: string | null;
    displayFrom: string | null;
    displayUntil: string | null;
    repostedFromId: string | null;
  } | null;
}

interface BannerSlotCardProps {
  slot: BannerSlotFormData;
}

/** The default (or persisted) editable values for a banner slot's form. */
interface BannerSlotValues {
  content: string;
  textColor: string;
  backgroundColor: string;
  displayFrom: string;
  displayUntil: string;
  repostedFromId: string;
}

/** The values used when a slot has no persisted notification. */
const DEFAULT_BANNER_VALUES: BannerSlotValues = {
  content: '',
  textColor: '#ffffff',
  backgroundColor: '#000000',
  displayFrom: '',
  displayUntil: '',
  repostedFromId: '',
};

/** Derives the initial form values from a slot's persisted notification (or defaults). */
const getInitialBannerValues = (
  notification: BannerSlotFormData['notification']
): BannerSlotValues => {
  if (!notification) {
    return DEFAULT_BANNER_VALUES;
  }
  return {
    content: notification.content ?? '',
    textColor: notification.textColor ?? '#ffffff',
    backgroundColor: notification.backgroundColor ?? '#000000',
    displayFrom: notification.displayFrom ?? '',
    displayUntil: notification.displayUntil ?? '',
    repostedFromId: notification.repostedFromId ?? '',
  };
};

interface BannerPreviewProps {
  content: string;
  textColor: string;
  backgroundColor: string;
}

/** The live preview strip; renders nothing until there is content to show. */
const BannerPreview = ({ content, textColor, backgroundColor }: BannerPreviewProps) => {
  if (!content) {
    return null;
  }
  return (
    <div
      className={cn(
        'px-4 py-2 text-center text-sm',
        isDarkColor(backgroundColor) ? 'banner-strip-dark' : 'banner-strip-light'
      )}
      style={{ color: textColor, backgroundColor }}
      dangerouslySetInnerHTML={{
        __html: addLinkAttributes(sanitizeNotificationHtml(content)),
      }}
    />
  );
};

interface BannerDatePickersProps {
  displayFrom: string;
  displayUntil: string;
  displayUntilError?: string;
  onDisplayFromChange: (value: string) => void;
  onDisplayUntilChange: (value: string) => void;
}

/** The "Display From" / "Display Until" date pickers plus the until-field error. */
const BannerDatePickers = ({
  displayFrom,
  displayUntil,
  displayUntilError,
  onDisplayFromChange,
  onDisplayUntilChange,
}: BannerDatePickersProps) => (
  <>
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Display From</Label>
        <DatePicker
          fieldName="displayFrom"
          value={displayFrom ? displayFrom.split('T')[0] : ''}
          onSelect={onDisplayFromChange}
        />
      </div>
      <div className="space-y-2">
        <Label>Display Until</Label>
        <DatePicker
          fieldName="displayUntil"
          value={displayUntil ? displayUntil.split('T')[0] : ''}
          onSelect={onDisplayUntilChange}
        />
      </div>
    </div>
    {displayUntilError && <p className="text-destructive text-sm">{displayUntilError}</p>}
  </>
);

interface BannerActionsProps {
  isPending: boolean;
  isDeletingBanner: boolean;
  hasNotification: boolean;
  onDelete: () => void;
}

/** The Save submit button plus a Delete button shown only for an existing notification. */
const BannerActions = ({
  isPending,
  isDeletingBanner,
  hasNotification,
  onDelete,
}: BannerActionsProps) => (
  <div className="flex gap-2">
    <Button type="submit" disabled={isPending} size="sm">
      {isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Save className="mr-2 h-4 w-4" />
      )}
      Save
    </Button>
    {hasNotification && (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={isDeletingBanner}
        onClick={onDelete}
      >
        {isDeletingBanner ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="mr-2 h-4 w-4" />
        )}
        Delete Notification
      </Button>
    )}
  </div>
);

export const BannerSlotCard = ({ slot }: BannerSlotCardProps) => {
  const initialValues = getInitialBannerValues(slot.notification);
  const [content, setContent] = useState(initialValues.content);
  const [textColor, setTextColor] = useState(initialValues.textColor);
  const [backgroundColor, setBackgroundColor] = useState(initialValues.backgroundColor);
  const [displayFrom, setDisplayFrom] = useState(initialValues.displayFrom);
  const [displayUntil, setDisplayUntil] = useState(initialValues.displayUntil);
  const [repostedFromId, setRepostedFromId] = useState(initialValues.repostedFromId);
  const { upsertBannerAsync } = useUpsertBannerNotificationMutation();
  const { deleteBannerAsync, isDeletingBanner } = useDeleteBannerNotificationMutation();

  const boundAction = useCallback((): Promise<FormState> => {
    // Banner inputs are controlled local state (not native form fields), so build
    // the typed values here. The hook serializes them and the banner caches are
    // invalidated on success; the action's FormState is returned unchanged.
    const values: Record<string, unknown> = {
      slotNumber: slot.slotNumber,
      content,
      textColor,
      backgroundColor,
      displayFrom,
      displayUntil,
    };
    if (repostedFromId) {
      values.repostedFromId = repostedFromId;
    }
    return upsertBannerAsync(values as BannerNotificationFormData);
  }, [
    slot.slotNumber,
    content,
    textColor,
    backgroundColor,
    displayFrom,
    displayUntil,
    repostedFromId,
    upsertBannerAsync,
  ]);

  const [formState, formAction, isPending] = useActionState<FormState, FormData>(
    boundAction,
    EMPTY_FORM_STATE
  );

  const handleDelete = async () => {
    const result = await deleteBannerAsync({ slotNumber: slot.slotNumber });
    if (result.success) {
      setContent('');
      setTextColor('#ffffff');
      setBackgroundColor('#000000');
      setDisplayFrom('');
      setDisplayUntil('');
      setRepostedFromId('');
    }
  };

  const handleRepostSelect = (notification: {
    id: string;
    content: string | null;
    textColor: string | null;
    backgroundColor: string | null;
  }) => {
    setRepostedFromId(notification.id);
    if (notification.content) setContent(notification.content);
    if (notification.textColor) setTextColor(notification.textColor);
    if (notification.backgroundColor) setBackgroundColor(notification.backgroundColor);
  };

  const thumbnailUrl = `/${BANNER_CDN_PATH}/${slot.imageFilename}`;

  return (
    <div className="border p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="relative h-16 w-28 shrink-0 overflow-hidden">
          <Image
            src={thumbnailUrl}
            alt={`Banner ${slot.slotNumber}`}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
        <h3 className="text-lg font-semibold">Slot {slot.slotNumber}</h3>
      </div>

      <form action={formAction} className="space-y-4">
        {/* Notification content */}
        <div className="space-y-2">
          <Label htmlFor={`content-${slot.slotNumber}`}>Notification Content</Label>
          <Textarea
            id={`content-${slot.slotNumber}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="HTML content (strong, em, a tags allowed)..."
            rows={3}
            maxLength={500}
            className="font-mono text-sm"
          />
          <p className="text-xs text-zinc-950">{content.length}/500 characters</p>
          {formState.errors?.content && (
            <p className="text-destructive text-sm">{formState.errors.content[0]}</p>
          )}
        </div>

        {/* Color pickers */}
        <div className="flex gap-4">
          <div className="space-y-2">
            <Label htmlFor={`textColor-${slot.slotNumber}`}>Text Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id={`textColor-${slot.slotNumber}`}
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="h-9 w-12 cursor-pointer border"
              />
              <span className="text-xs text-zinc-950">{textColor}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`bgColor-${slot.slotNumber}`}>Background Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id={`bgColor-${slot.slotNumber}`}
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="h-9 w-12 cursor-pointer border"
              />
              <span className="text-xs text-zinc-950">{backgroundColor}</span>
            </div>
          </div>
        </div>

        {/* Preview strip */}
        <BannerPreview content={content} textColor={textColor} backgroundColor={backgroundColor} />

        {/* Date pickers */}
        <BannerDatePickers
          displayFrom={displayFrom}
          displayUntil={displayUntil}
          displayUntilError={formState.errors?.displayUntil?.[0]}
          onDisplayFromChange={setDisplayFrom}
          onDisplayUntilChange={setDisplayUntil}
        />

        {/* Repost search */}
        <div className="space-y-2">
          <Label>Repost from Previous Notification</Label>
          <NotificationSearch onSelect={handleRepostSelect} />
        </div>

        {/* Form-level errors */}
        {formState.errors?._form && (
          <p className="text-destructive text-sm">{formState.errors._form[0]}</p>
        )}

        {/* Success message */}
        {formState.success && <p className="text-sm text-green-600">Saved successfully.</p>}

        {/* Actions */}
        <BannerActions
          isPending={isPending}
          isDeletingBanner={isDeletingBanner}
          hasNotification={!!slot.notification}
          onDelete={handleDelete}
        />
      </form>
    </div>
  );
};

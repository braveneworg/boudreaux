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

export const BannerSlotCard = ({ slot }: BannerSlotCardProps) => {
  const [content, setContent] = useState(slot.notification?.content ?? '');
  const [textColor, setTextColor] = useState(slot.notification?.textColor ?? '#ffffff');
  const [backgroundColor, setBackgroundColor] = useState(
    slot.notification?.backgroundColor ?? '#000000'
  );
  const [displayFrom, setDisplayFrom] = useState(slot.notification?.displayFrom ?? '');
  const [displayUntil, setDisplayUntil] = useState(slot.notification?.displayUntil ?? '');
  const [repostedFromId, setRepostedFromId] = useState(slot.notification?.repostedFromId ?? '');
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
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-sm">
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
                className="h-9 w-12 cursor-pointer rounded-sm border"
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
                className="h-9 w-12 cursor-pointer rounded-sm border"
              />
              <span className="text-xs text-zinc-950">{backgroundColor}</span>
            </div>
          </div>
        </div>

        {/* Preview strip */}
        {content && (
          <div
            className={cn(
              'rounded-sm px-4 py-2 text-center text-sm',
              isDarkColor(backgroundColor) ? 'banner-strip-dark' : 'banner-strip-light'
            )}
            style={{ color: textColor, backgroundColor }}
            dangerouslySetInnerHTML={{
              __html: addLinkAttributes(sanitizeNotificationHtml(content)),
            }}
          />
        )}

        {/* Date pickers */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Display From</Label>
            <DatePicker
              fieldName="displayFrom"
              value={displayFrom ? displayFrom.split('T')[0] : ''}
              onSelect={(dateString) => setDisplayFrom(dateString)}
            />
          </div>
          <div className="space-y-2">
            <Label>Display Until</Label>
            <DatePicker
              fieldName="displayUntil"
              value={displayUntil ? displayUntil.split('T')[0] : ''}
              onSelect={(dateString) => setDisplayUntil(dateString)}
            />
          </div>
        </div>
        {formState.errors?.displayUntil && (
          <p className="text-destructive text-sm">{formState.errors.displayUntil[0]}</p>
        )}

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
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending} size="sm">
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
          {slot.notification && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isDeletingBanner}
              onClick={handleDelete}
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
      </form>
    </div>
  );
};

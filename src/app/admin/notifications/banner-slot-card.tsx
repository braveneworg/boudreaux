/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useActionState, useCallback, useState } from 'react';

import Image from 'next/image';

import { Loader2, Save, Trash2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { DatePicker } from '@/app/components/ui/datepicker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createOrUpdateBannerNotificationAction } from '@/lib/actions/banner-notification-action';
import { BANNER_CDN_PATH } from '@/lib/constants/banner-slots';
import type { FormState } from '@/lib/types/form-state';
import { cn } from '@/lib/utils';
import { isDarkColor } from '@/lib/utils/color';
import {
  addLinkAttributes,
  sanitizeNotificationHtml,
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
  onDelete: (slotNumber: number) => Promise<{ success: boolean; error?: string }>;
}

const initialFormState: FormState = {
  fields: {},
  success: false,
};

export function BannerSlotCard({ slot, onDelete }: BannerSlotCardProps) {
  const [content, setContent] = useState(slot.notification?.content ?? '');
  const [textColor, setTextColor] = useState(slot.notification?.textColor ?? '#ffffff');
  const [backgroundColor, setBackgroundColor] = useState(
    slot.notification?.backgroundColor ?? '#000000'
  );
  const [displayFrom, setDisplayFrom] = useState(slot.notification?.displayFrom ?? '');
  const [displayUntil, setDisplayUntil] = useState(slot.notification?.displayUntil ?? '');
  const [repostedFromId, setRepostedFromId] = useState(slot.notification?.repostedFromId ?? '');
  const [isDeleting, setIsDeleting] = useState(false);

  const boundAction = useCallback(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      formData.set('slotNumber', String(slot.slotNumber));
      formData.set('content', content);
      formData.set('textColor', textColor);
      formData.set('backgroundColor', backgroundColor);
      formData.set('displayFrom', displayFrom);
      formData.set('displayUntil', displayUntil);
      if (repostedFromId) {
        formData.set('repostedFromId', repostedFromId);
      }
      return createOrUpdateBannerNotificationAction(_prevState, formData);
    },
    [
      slot.slotNumber,
      content,
      textColor,
      backgroundColor,
      displayFrom,
      displayUntil,
      repostedFromId,
    ]
  );

  const [formState, formAction, isPending] = useActionState<FormState, FormData>(
    boundAction,
    initialFormState
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(slot.slotNumber);
      setContent('');
      setTextColor('#ffffff');
      setBackgroundColor('#000000');
      setDisplayFrom('');
      setDisplayUntil('');
      setRepostedFromId('');
    } finally {
      setIsDeleting(false);
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
        <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded">
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
          <p className="text-xs text-muted-foreground">{content.length}/500 characters</p>
          {formState.errors?.content && (
            <p className="text-sm text-destructive">{formState.errors.content[0]}</p>
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
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <span className="text-xs text-muted-foreground">{textColor}</span>
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
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <span className="text-xs text-muted-foreground">{backgroundColor}</span>
            </div>
          </div>
        </div>

        {/* Preview strip */}
        {content && (
          <div
            className={cn(
              'rounded px-4 py-2 text-center text-sm',
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
          <p className="text-sm text-destructive">{formState.errors.displayUntil[0]}</p>
        )}

        {/* Repost search */}
        <div className="space-y-2">
          <Label>Repost from Previous Notification</Label>
          <NotificationSearch onSelect={handleRepostSelect} />
        </div>

        {/* Form-level errors */}
        {formState.errors?._form && (
          <p className="text-sm text-destructive">{formState.errors._form[0]}</p>
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
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? (
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
}

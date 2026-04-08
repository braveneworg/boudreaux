/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { Loader2, Save } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateRotationIntervalAction } from '@/lib/actions/banner-notification-action';
import { MAX_ROTATION_INTERVAL, MIN_ROTATION_INTERVAL } from '@/lib/constants/banner-slots';

interface RotationIntervalFormProps {
  currentInterval: number;
}

export function RotationIntervalForm({ currentInterval }: RotationIntervalFormProps) {
  const [interval, setInterval] = useState(currentInterval);
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async () => {
    setIsPending(true);
    setMessage(null);
    try {
      const result = await updateRotationIntervalAction(interval);
      if (result.success) {
        setMessage({ type: 'success', text: 'Rotation interval updated.' });
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Failed to update.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 text-lg font-semibold">Rotation Interval</h3>
      <div className="flex items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="rotation-interval">
            Seconds ({MIN_ROTATION_INTERVAL}-{MAX_ROTATION_INTERVAL})
          </Label>
          <Input
            id="rotation-interval"
            type="number"
            min={MIN_ROTATION_INTERVAL}
            max={MAX_ROTATION_INTERVAL}
            step={0.5}
            value={interval}
            onChange={(e) => setInterval(parseFloat(e.target.value) || MIN_ROTATION_INTERVAL)}
            className="w-24"
          />
        </div>
        <Button type="button" size="sm" disabled={isPending} onClick={handleSave}>
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
      {message && (
        <p
          className={`mt-2 text-sm ${message.type === 'success' ? 'text-green-600' : 'text-destructive'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

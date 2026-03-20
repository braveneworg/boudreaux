/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { UserPlus2Icon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import {
  getSubscriberRate,
  SUBSCRIBER_RATE_TIERS,
  TIER_LABELS,
  type SubscriberRateTier,
} from '@/lib/subscriber-rates';

interface RateSelectStepProps {
  selectedTier: SubscriberRateTier | null;
  onTierChange: (tier: SubscriberRateTier) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export const RateSelectStep = ({
  selectedTier,
  onTierChange,
  onCancel,
  onConfirm,
}: RateSelectStepProps) => (
  <>
    <DialogHeader>
      <DialogTitle>Choose Your Plan</DialogTitle>
      <DialogDescription>
        Subscribe for access to all music on the Fake Four Inc. record label.
      </DialogDescription>
    </DialogHeader>

    <RadioGroup
      value={selectedTier ?? ''}
      onValueChange={(value) => onTierChange(value as SubscriberRateTier)}
      className="gap-4"
    >
      {SUBSCRIBER_RATE_TIERS.map((tier) => (
        <div key={tier} className="flex items-center gap-3">
          <RadioGroupItem value={tier} id={`rate-${tier}`} />
          <Label htmlFor={`rate-${tier}`} className="cursor-pointer font-normal">
            {TIER_LABELS[tier]} — ${getSubscriberRate(tier).toFixed(2)}/month
          </Label>
        </div>
      ))}
    </RadioGroup>

    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" onClick={onConfirm} disabled={!selectedTier}>
        <UserPlus2Icon className="size-4" />
        Go for It!
      </Button>
    </DialogFooter>
  </>
);

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRouter } from 'next/navigation';

import { UserPlus2Icon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';

interface SubscribeButtonProps {
  className?: string;
  subscribeMessage: string;
  onClick?: () => void;
}

export const SubscribeButton = ({ className, subscribeMessage, onClick }: SubscribeButtonProps) => {
  const router = useRouter();

  const handleClick = () => {
    onClick?.();
    router.push('/subscribe');
  };

  return (
    <Button className={className} variant="outline" onClick={handleClick}>
      <UserPlus2Icon className="size-4" />
      {subscribeMessage}
    </Button>
  );
};

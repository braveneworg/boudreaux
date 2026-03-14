/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/app/components/ui/button';

interface SubscribeButtonProps {
  subscribeMessage: string;
  onClick?: () => void;
}

export const SubscribeButton = ({ subscribeMessage, onClick }: SubscribeButtonProps) => {
  const router = useRouter();

  const handleClick = () => {
    onClick?.();
    router.push('/subscribe');
  };

  return (
    <Button variant="outline" onClick={handleClick}>
      {subscribeMessage}
    </Button>
  );
};

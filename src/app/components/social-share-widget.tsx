/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { MessageSquareIcon } from 'lucide-react';
import {
  FacebookIcon,
  FacebookMessengerIcon,
  FacebookMessengerShareButton,
  FacebookShareButton,
  TelegramIcon,
  TelegramShareButton,
  WhatsappIcon,
  WhatsappShareButton,
  XIcon,
  XShareButton,
} from 'react-share';

interface SocialShareWidgetProps {
  artistUrl: string;
  facebookMessengerAppId?: string;
}

/**
 * Social share navigation widget with animated share buttons.
 * Displays sharing options for X, Facebook, WhatsApp, Telegram, SMS, WeChat, and Messenger.
 */
export const SocialShareWidget = ({
  artistUrl,
  facebookMessengerAppId = '',
}: SocialShareWidgetProps) => {
  const shareTitle = 'Check this out on Fake Four Inc.!';
  const iconSize = 32;

  return (
    <>
      <FacebookShareButton
        className="pointer-events-auto size-10"
        url={artistUrl}
        htmlTitle="Share on Facebook"
        aria-label="Share on Facebook"
      >
        <FacebookIcon size={iconSize} className="rounded-sm bg-zinc-700" />
      </FacebookShareButton>

      <FacebookMessengerShareButton
        className="pointer-events-auto size-10"
        url={artistUrl}
        appId={facebookMessengerAppId}
        htmlTitle="Share on Messenger"
        aria-label="Share on Messenger"
      >
        <FacebookMessengerIcon className="rounded-sm bg-zinc-700" size={iconSize} />
      </FacebookMessengerShareButton>

      <WhatsappShareButton
        className="pointer-events-auto size-10"
        url={artistUrl}
        title={shareTitle}
        htmlTitle="Share on WhatsApp"
        aria-label="Share on WhatsApp"
      >
        <WhatsappIcon size={iconSize} className="rounded-sm bg-zinc-700" />
      </WhatsappShareButton>

      {/* SMS / Messages button */}
      <a
        href={`sms:?&body=${encodeURIComponent(`${shareTitle} ${artistUrl}`)}`}
        className="pointer-events-auto -mt-1.5 inline-flex size-10 items-center justify-center rounded-sm"
        aria-label="Share via SMS"
        title="Share via SMS"
        style={{ width: iconSize, height: iconSize }}
      >
        <MessageSquareIcon size={iconSize} className="rounded-sm bg-zinc-700 p-2 text-white" />
      </a>

      <TelegramShareButton
        className="pointer-events-auto ml-2 size-10"
        url={artistUrl}
        title={shareTitle}
        htmlTitle="Share on Telegram"
        aria-label="Share on Telegram"
      >
        <TelegramIcon size={iconSize} className="rounded-sm bg-zinc-700" />
      </TelegramShareButton>

      {/* WeChat share link (not available in react-share, using web intent) */}
      <a
        href={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(artistUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="relative -top-3 inline-flex size-10 rounded-sm"
        aria-label="Share on WeChat"
        title="Share on WeChat (scan QR code)"
      >
        <span
          className="mt-3 inline-flex items-center justify-center rounded-sm bg-zinc-700 text-xs font-bold text-white"
          style={{ width: iconSize, height: iconSize }}
        >
          微信
        </span>
      </a>

      <XShareButton
        className="pointer-events-auto size-10"
        title={shareTitle}
        htmlTitle="Share on X"
        url={artistUrl}
        aria-label="Share on X"
      >
        <XIcon size={iconSize} className="rounded-sm bg-zinc-700" />
      </XShareButton>
    </>
  );
};

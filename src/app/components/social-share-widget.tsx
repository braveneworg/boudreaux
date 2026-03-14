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
        className="size-10 pointer-events-auto"
        url={artistUrl}
        htmlTitle="Share on Facebook"
        aria-label="Share on Facebook"
      >
        <FacebookIcon size={iconSize} className="rounded-sm bg-zinc-700" />
      </FacebookShareButton>

      <FacebookMessengerShareButton
        className="pointer-events-auto"
        url={artistUrl}
        appId={facebookMessengerAppId}
        htmlTitle="Share on Messenger"
        aria-label="Share on Messenger"
      >
        <FacebookMessengerIcon className="rounded-sm bg-zinc-700" size={iconSize} />
      </FacebookMessengerShareButton>

      <WhatsappShareButton
        className="size-10 ml-2 pointer-events-auto"
        url={artistUrl}
        title={shareTitle}
        htmlTitle="Share on WhatsApp"
        aria-label="Share on WhatsApp"
      >
        <WhatsappIcon size={iconSize} className="rounded-sm bg-zinc-700" />
      </WhatsappShareButton>

      {/* SMS / Messages button */}
      <a
        href={`sms:?body=${encodeURIComponent(`${shareTitle} ${artistUrl}`)}`}
        className="pointer-events-auto inline-flex items-center justify-center rounded-sm"
        aria-label="Share via SMS"
        title="Share via SMS"
        style={{ width: iconSize, height: iconSize }}
      >
        <MessageSquareIcon size={iconSize} className="rounded-sm p-2 bg-zinc-700 text-white" />
      </a>

      <TelegramShareButton
        className="size-10 pointer-events-auto ml-2"
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
        className="inline-flex rounded-sm relative -top-3"
        aria-label="Share on WeChat"
        title="Share on WeChat (scan QR code)"
        style={{ width: iconSize, height: iconSize }}
      >
        <span
          className="inline-flex items-center justify-center rounded-sm bg-zinc-700 text-white text-xs font-bold"
          style={{ width: iconSize, height: iconSize }}
        >
          微信
        </span>
      </a>

      <XShareButton
        className="size-10 pointer-events-auto ml-2"
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

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement, ReactNode } from 'react';

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
  /** Legacy share-URL prop (artist pages). Prefer `url` for new consumers. */
  artistUrl?: string;
  /** Neutral share-URL prop; takes precedence over `artistUrl`. */
  url?: string;
  facebookMessengerAppId?: string;
}

// The gray layers' zinc shades (Tailwind's zinc-500 … zinc-800). react-share
// paints its icon background with an inline `fill`, which a class can't
// override, so the gray icon gets its fill through `bgStyle` instead.
const ZINC_500 = '#71717a';
const ZINC_600 = '#52525b';
const ZINC_700 = '#3f3f46';
const ZINC_800 = '#27272a';

/** The brand layer: hidden at rest, faded in while its control is hovered, focused or pressed. */
const BRAND_LAYER_CLASS =
  'absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100';

interface ShareIconLayersProps {
  /** The gray icon shown at rest. */
  gray: ReactNode;
  /** The brand-colored icon laid over it. */
  brand: ReactNode;
}

/**
 * One network's icon as two stacked layers: the gray one at rest and the
 * brand one on top, faded in by the control's `group` state. Only the gray
 * layer is announced; the control's `aria-label` names it.
 */
const ShareIconLayers = ({ gray, brand }: ShareIconLayersProps): ReactElement => (
  <span className="relative inline-flex">
    <span data-share-layer="gray" className="inline-flex">
      {gray}
    </span>
    <span data-share-layer="brand" aria-hidden="true" className={BRAND_LAYER_CLASS}>
      {brand}
    </span>
  </span>
);

/**
 * Social share navigation widget with animated share buttons.
 * Displays sharing options for X, Facebook, WhatsApp, Telegram, SMS, WeChat, and Messenger.
 * Each icon is gray at rest and crossfades to its brand color on hover, focus
 * or press.
 */
export const SocialShareWidget = ({
  artistUrl,
  url,
  facebookMessengerAppId = '',
}: SocialShareWidgetProps) => {
  const shareUrl = url ?? artistUrl ?? '';
  const shareTitle = 'Check this out on Fake Four Inc.!';
  const iconSize = 32;

  return (
    <>
      <FacebookShareButton
        className="group pointer-events-auto size-10"
        url={shareUrl}
        htmlTitle="Share on Facebook"
        aria-label="Share on Facebook"
      >
        <ShareIconLayers
          gray={<FacebookIcon size={iconSize} bgStyle={{ fill: ZINC_700 }} />}
          brand={<FacebookIcon size={iconSize} className="block" />}
        />
      </FacebookShareButton>

      <FacebookMessengerShareButton
        className="group pointer-events-auto size-10"
        url={shareUrl}
        appId={facebookMessengerAppId}
        htmlTitle="Share on Messenger"
        aria-label="Share on Messenger"
      >
        <ShareIconLayers
          gray={<FacebookMessengerIcon size={iconSize} bgStyle={{ fill: ZINC_600 }} />}
          brand={<FacebookMessengerIcon size={iconSize} className="block" />}
        />
      </FacebookMessengerShareButton>

      <WhatsappShareButton
        className="group pointer-events-auto size-10"
        url={shareUrl}
        title={shareTitle}
        htmlTitle="Share on WhatsApp"
        aria-label="Share on WhatsApp"
      >
        <ShareIconLayers
          gray={<WhatsappIcon size={iconSize} bgStyle={{ fill: ZINC_500 }} />}
          brand={<WhatsappIcon size={iconSize} className="block" />}
        />
      </WhatsappShareButton>

      {/* SMS / Messages button; the brand layer is Messages green. */}
      <a
        href={`sms:?&body=${encodeURIComponent(`${shareTitle} ${shareUrl}`)}`}
        className="group pointer-events-auto -mt-1.5 inline-flex size-8 items-center justify-center"
        aria-label="Share via SMS"
        title="Share via SMS"
      >
        <ShareIconLayers
          gray={<MessageSquareIcon size={iconSize} className="bg-zinc-700 p-2 text-white" />}
          brand={
            <MessageSquareIcon size={iconSize} className="block bg-[#34C759] p-2 text-white" />
          }
        />
      </a>

      <TelegramShareButton
        className="group pointer-events-auto ml-2 size-10"
        url={shareUrl}
        title={shareTitle}
        htmlTitle="Share on Telegram"
        aria-label="Share on Telegram"
      >
        <ShareIconLayers
          gray={<TelegramIcon size={iconSize} bgStyle={{ fill: ZINC_600 }} />}
          brand={<TelegramIcon size={iconSize} className="block" />}
        />
      </TelegramShareButton>

      {/* WeChat share link (not available in react-share, using web intent).
          The accessible name leads with the visible 微信 text (WCAG 2.5.3 /
          Lighthouse label-content-name-mismatch) so speech-input users can
          activate the control by saying its label. The brand layer is WeChat
          green. */}
      <a
        href={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative -top-3 inline-flex size-10"
        aria-label="微信 — Share on WeChat (scan QR code)"
        title="Share on WeChat (scan QR code)"
      >
        <span className="mt-3 inline-flex">
          <ShareIconLayers
            gray={
              <span className="inline-flex size-8 items-center justify-center bg-zinc-700 text-xs font-bold text-white">
                微信
              </span>
            }
            brand={
              <span className="flex size-8 items-center justify-center bg-[#07C160] text-xs font-bold text-white">
                微信
              </span>
            }
          />
        </span>
      </a>

      <XShareButton
        className="group pointer-events-auto size-10"
        title={shareTitle}
        htmlTitle="Share on X"
        url={shareUrl}
        aria-label="Share on X"
      >
        <ShareIconLayers
          gray={<XIcon size={iconSize} bgStyle={{ fill: ZINC_800 }} />}
          brand={<XIcon size={iconSize} className="block" />}
        />
      </XShareButton>
    </>
  );
};

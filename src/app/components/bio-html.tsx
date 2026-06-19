/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import parse, { domToReact, Element } from 'html-react-parser';

import type { DOMNode, HTMLReactParserOptions } from 'html-react-parser';

interface BioHtmlProps {
  /** Pre-sanitized bio HTML (see `sanitizeBioHtml`). */
  html: string;
  className?: string;
}

/** Fallback intrinsic size for inline bio images that omit width/height. */
const DEFAULT_IMAGE_WIDTH = 1200;
const DEFAULT_IMAGE_HEIGHT = 900;

const parseDimension = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Maps the sanitized bio HTML onto React, replacing raw `<a>`/`<img>` tags with
 * Next.js `<Link>` and `<Image>`. Links are hardened with
 * `rel="nofollow noopener noreferrer"` and `target="_blank"`; images flow
 * through the global CDN loader (variants/`srcset`) instead of hotlinking.
 */
const replace: HTMLReactParserOptions['replace'] = (domNode) => {
  if (!(domNode instanceof Element)) return undefined;

  const options: HTMLReactParserOptions = { replace };

  if (domNode.name === 'a') {
    const href = domNode.attribs.href;
    // An anchor stripped of its href by the sanitizer renders as plain text.
    if (!href) return <>{domToReact(domNode.children as DOMNode[], options)}</>;

    return (
      <Link href={href} rel="nofollow noopener noreferrer" target="_blank">
        {domToReact(domNode.children as DOMNode[], options)}
      </Link>
    );
  }

  if (domNode.name === 'img') {
    const src = domNode.attribs.src;
    if (!src) return <></>;

    return (
      <Image
        src={src}
        alt={domNode.attribs.alt ?? ''}
        width={parseDimension(domNode.attribs.width, DEFAULT_IMAGE_WIDTH)}
        height={parseDimension(domNode.attribs.height, DEFAULT_IMAGE_HEIGHT)}
        sizes="(min-width: 768px) 50vw, 100vw"
        className="h-auto w-full rounded-md"
      />
    );
  }

  return undefined;
};

/**
 * Renders sanitized bio HTML with Next.js primitives instead of
 * `dangerouslySetInnerHTML`. The input must already be sanitized
 * (`sanitizeBioHtml`); this component only maps trusted tags to components.
 *
 * @param html - Sanitized bio HTML string.
 * @param className - Optional wrapper class (e.g. prose styles).
 */
export const BioHtml = ({ html, className }: BioHtmlProps): JSX.Element => (
  <div className={className}>{parse(html, { replace })}</div>
);

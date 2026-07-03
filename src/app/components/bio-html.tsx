/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import parse, { domToReact, Element } from 'html-react-parser';
import { ExternalLink } from 'lucide-react';

import { cn } from '@/lib/utils';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';

import type { DOMNode, HTMLReactParserOptions } from 'html-react-parser';

interface BioHtmlProps {
  /** Pre-sanitized bio HTML (see `sanitizeBioHtml`). */
  html: string;
  className?: string;
}

/** Fallback intrinsic size for inline bio images that omit width/height. */
const DEFAULT_IMAGE_WIDTH = 1200;
const DEFAULT_IMAGE_HEIGHT = 900;

/** Static float-class map — Tailwind-visible literals only (never dynamic). */
const FIGURE_FLOAT_CLASSES = new Map<string, string>([
  ['bio-figure--left', 'float-left mr-4 mb-2'],
  ['bio-figure--right', 'float-right ml-4 mb-2'],
  ['bio-figure--center', 'mx-auto mb-4'],
]);

const parseDimension = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const figureClassName = (classAttr: string | undefined): string => {
  const floatClass = (classAttr ?? '')
    .split(/\s+/)
    .map((token) => FIGURE_FLOAT_CLASSES.get(token))
    .find(Boolean);
  return cn('bio-figure', floatClass ?? FIGURE_FLOAT_CLASSES.get('bio-figure--center'));
};

const parseFigureWidth = (styleAttr: string | undefined): string | undefined => {
  const match = /width:\s*([\d.]+%)/.exec(styleAttr ?? '');
  return match?.[1];
};

const renderAnchor = (domNode: Element, options: HTMLReactParserOptions): JSX.Element => {
  const href = domNode.attribs.href;
  // An anchor stripped of its href by the sanitizer renders as plain text.
  if (!href) return <>{domToReact(domNode.children as DOMNode[], options)}</>;

  // Internal links navigate same-tab with no rel hardening and no icon.
  if (isInternalBioUrl(href)) {
    return <Link href={href}>{domToReact(domNode.children as DOMNode[], options)}</Link>;
  }

  // Trailing "opens in a new tab" affordance after the link text. The icon is
  // aria-hidden so the link's accessible name stays the text content only.
  return (
    <Link
      href={href}
      rel="nofollow noopener noreferrer"
      target="_blank"
      className="inline-flex items-baseline gap-0.5"
    >
      {domToReact(domNode.children as DOMNode[], options)}
      <ExternalLink className="size-3 self-center" aria-hidden />
    </Link>
  );
};

const renderImage = (domNode: Element): JSX.Element => {
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
};

const renderFigure = (domNode: Element, options: HTMLReactParserOptions): JSX.Element => {
  const width = parseFigureWidth(domNode.attribs.style);

  return (
    <figure
      className={figureClassName(domNode.attribs.class)}
      // Width is admin-set data (percent, sanitizer-validated), not a style
      // choice — same data-driven exception as the sanitizer's font-size spans.
      style={width ? { width } : undefined}
    >
      {domToReact(domNode.children as DOMNode[], options)}
    </figure>
  );
};

// The caption floor is a fixed 11px and never scales with the figure width.
const renderFigcaption = (domNode: Element, options: HTMLReactParserOptions): JSX.Element => (
  <figcaption className="text-muted-foreground mt-1 text-[11px] leading-snug [&_.bio-figure-attribution]:italic [&_.bio-figure-title]:font-medium [&_span]:block">
    {domToReact(domNode.children as DOMNode[], options)}
  </figcaption>
);

/**
 * Maps the sanitized bio HTML onto React, replacing raw `<a>`/`<img>` tags with
 * Next.js `<Link>` and `<Image>` and `<figure>`/`<figcaption>` with floated,
 * width-constrained figures. External links are hardened with
 * `rel="nofollow noopener noreferrer"` and `target="_blank"`; internal links
 * navigate same-tab without the icon. Images flow through the global CDN
 * loader (variants/`srcset`) instead of hotlinking.
 */
const replace: HTMLReactParserOptions['replace'] = (domNode) => {
  if (!(domNode instanceof Element)) return undefined;

  const options: HTMLReactParserOptions = { replace };

  if (domNode.name === 'a') return renderAnchor(domNode, options);
  if (domNode.name === 'img') return renderImage(domNode);
  if (domNode.name === 'figure') return renderFigure(domNode, options);
  if (domNode.name === 'figcaption') return renderFigcaption(domNode, options);

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

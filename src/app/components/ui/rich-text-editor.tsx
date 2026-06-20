/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import NextImage from 'next/image';

import { Image as TiptapImage } from '@tiptap/extension-image';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Pilcrow,
  Type,
} from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { cn } from '@/lib/utils';
import { isHttpUrl } from '@/lib/utils/is-http-url';

import type { Editor } from '@tiptap/react';

/** An image the admin can insert into a bio (uploaded or re-hosted bio image). */
export interface RichTextEditorImage {
  url: string;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}

interface RichTextEditorProps {
  /** Current HTML value (controlled). */
  value: string;
  /** Called with the editor's HTML on every change. */
  onChange: (html: string) => void;
  /** Images selectable from the insert-image picker. */
  images?: RichTextEditorImage[];
  /** Accessible label for the editing surface. */
  ariaLabel?: string;
  id?: string;
  className?: string;
}

/** Font-size presets offered in the toolbar dropdown. */
const FONT_SIZES = [
  { label: 'Small', value: '14px' },
  { label: 'Normal', value: '16px' },
  { label: 'Large', value: '20px' },
  { label: 'Extra large', value: '24px' },
] as const;

/** Image node that also persists width/height so variants render at the right size. */
const BioEditorImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width'),
        renderHTML: (attributes) => (attributes.width ? { width: attributes.width } : {}),
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute('height'),
        renderHTML: (attributes) => (attributes.height ? { height: attributes.height } : {}),
      },
    };
  },
});

/**
 * Minimal Tiptap rich-text editor for the artist bio fields. Toolbar: bold,
 * italic, font-size, link, insert-image (from the artist's images), and new
 * paragraph. Output HTML is sanitized again on save (`sanitizeBioHtml`).
 *
 * Load via `next/dynamic` with `ssr: false` — it is admin-only and never ships
 * to public pages.
 *
 * @param value - Controlled HTML value.
 * @param onChange - Receives the editor HTML on each change.
 * @param images - Images offered in the insert-image picker.
 */
export const RichTextEditor = ({
  value,
  onChange,
  images = [],
  ariaLabel,
  id,
  className,
}: RichTextEditorProps): JSX.Element => {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageOpen, setImageOpen] = useState(false);
  // The last HTML this editor emitted, so the value-sync effect can recognize
  // its own change echoing back through the controlled `value` and skip the
  // expensive full-document getHTML() serialization on every keystroke.
  const lastEmittedHtml = useRef<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Restrict headings to h2–h4 to match the bio HTML sanitizer allowlist
        // (h1 is reserved for the page title and would be stripped on save).
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, protocols: ['http', 'https'], autolink: false },
      }),
      TextStyle,
      FontSize,
      BioEditorImage,
    ],
    content: value,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel ?? 'Bio editor',
        role: 'textbox',
        'aria-multiline': 'true',
        class: 'min-h-40 px-3 py-2 focus:outline-none prose prose-sm dark:prose-invert max-w-none',
        ...(id ? { id } : {}),
      },
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      lastEmittedHtml.current = html;
      onChange(html);
    },
  });

  // Sync external value changes (RHF reset on load, AI-generation populating the
  // fields) into the editor. When `value` equals the HTML we just emitted, this
  // is our own keystroke echoing back — skip it without serializing the doc.
  // `emitUpdate: false` prevents an onChange feedback loop on genuine externals.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedHtml.current) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: instance }: { editor: Editor | null }) => ({
      isBold: instance?.isActive('bold') ?? false,
      isItalic: instance?.isActive('italic') ?? false,
      isLink: instance?.isActive('link') ?? false,
      isHeading2: instance?.isActive('heading', { level: 2 }) ?? false,
      isHeading3: instance?.isActive('heading', { level: 3 }) ?? false,
      isBulletList: instance?.isActive('bulletList') ?? false,
      isOrderedList: instance?.isActive('orderedList') ?? false,
    }),
  });

  if (!editor) {
    return <div className={cn('border-input rounded-md border', className)} aria-busy="true" />;
  }

  const openLinkDialog = (): void => {
    setLinkUrl(editor.getAttributes('link').href ?? '');
    setLinkOpen(true);
  };

  const applyLink = (): void => {
    const href = linkUrl.trim();
    if (!isHttpUrl(href)) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
  };

  const removeLink = (): void => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
  };

  const insertImage = (image: RichTextEditorImage): void => {
    editor
      .chain()
      .focus()
      .setImage({
        src: image.url,
        alt: image.alt ?? '',
        ...(image.width ? { width: image.width } : {}),
        ...(image.height ? { height: image.height } : {}),
      })
      .run();
    setImageOpen(false);
  };

  return (
    <div className={cn('border-input rounded-md border', className)}>
      <div className="border-input flex flex-wrap items-center gap-1 border-b p-1" role="toolbar">
        <Button
          type="button"
          size="icon"
          variant={toolbarState?.isBold ? 'secondary' : 'ghost'}
          aria-label="Bold"
          aria-pressed={toolbarState?.isBold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={toolbarState?.isItalic ? 'secondary' : 'ghost'}
          aria-label="Italic"
          aria-pressed={toolbarState?.isItalic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" aria-hidden />
        </Button>

        <Button
          type="button"
          size="icon"
          variant={toolbarState?.isHeading2 ? 'secondary' : 'ghost'}
          aria-label="Heading 2"
          aria-pressed={toolbarState?.isHeading2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={toolbarState?.isHeading3 ? 'secondary' : 'ghost'}
          aria-label="Heading 3"
          aria-pressed={toolbarState?.isHeading3}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="size-4" aria-hidden />
        </Button>

        <Button
          type="button"
          size="icon"
          variant={toolbarState?.isBulletList ? 'secondary' : 'ghost'}
          aria-label="Bulleted list"
          aria-pressed={toolbarState?.isBulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={toolbarState?.isOrderedList ? 'secondary' : 'ghost'}
          aria-label="Numbered list"
          aria-pressed={toolbarState?.isOrderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" aria-hidden />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon" variant="ghost" aria-label="Font size">
              <Type className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {FONT_SIZES.map((size) => (
              <DropdownMenuItem
                key={size.value}
                onSelect={() => editor.chain().focus().setFontSize(size.value).run()}
              >
                {size.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => editor.chain().focus().unsetFontSize().run()}>
              Reset
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          size="icon"
          variant={toolbarState?.isLink ? 'secondary' : 'ghost'}
          aria-label="Link"
          aria-pressed={toolbarState?.isLink}
          onClick={openLinkDialog}
        >
          <Link2 className="size-4" aria-hidden />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Insert image"
          disabled={images.length === 0}
          onClick={() => setImageOpen(true)}
        >
          <ImageIcon className="size-4" aria-hidden />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="New paragraph"
          onClick={() => editor.chain().focus().insertContent('<p></p>').run()}
        >
          <Pilcrow className="size-4" aria-hidden />
        </Button>
      </div>

      <EditorContent editor={editor} />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insert link</DialogTitle>
            <DialogDescription>Enter an http(s) URL to link the selected text.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rte-link-url">URL</Label>
            <Input
              id="rte-link-url"
              type="url"
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={removeLink}>
              <Link2Off className="size-4" aria-hidden />
              Remove
            </Button>
            <Button type="button" onClick={applyLink} disabled={!isHttpUrl(linkUrl)}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insert image</DialogTitle>
            <DialogDescription>Choose one of this artist&apos;s images.</DialogDescription>
          </DialogHeader>
          <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
            {images.map((image) => (
              <li key={image.url}>
                <button
                  type="button"
                  aria-label={`Insert ${image.alt ?? 'image'}`}
                  className="ring-border focus-visible:ring-primary block overflow-hidden rounded-md ring-1 focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => insertImage(image)}
                >
                  <NextImage
                    src={image.url}
                    alt={image.alt ?? ''}
                    width={120}
                    height={120}
                    className="size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
};

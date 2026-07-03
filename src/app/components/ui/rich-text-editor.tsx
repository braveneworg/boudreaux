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
import { BubbleMenu } from '@tiptap/react/menus';
import { StarterKit } from '@tiptap/starter-kit';
import { Link2Off, Pencil } from 'lucide-react';

import { BioHtml } from '@/app/components/bio-html';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import { cn } from '@/lib/utils';
import { isHttpUrl } from '@/lib/utils/is-http-url';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';

import { handleBioEditorDrop } from './bio-editor-drop';
import { BioFigure } from './bio-figure-extension';
import { RichTextEditorToolbar } from './rich-text-editor-toolbar';

import type { ToolbarState } from './rich-text-editor-toolbar';
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

/** Valid bio link targets: absolute http(s) URLs or site-relative paths
 *  (`/releases/x`, but never protocol-relative `//host`). */
const isValidBioLinkUrl = (href: string): boolean =>
  isHttpUrl(href) || (href.startsWith('/') && !href.startsWith('//'));

interface LinkTargetRel {
  target: string | null;
  rel: string | null;
}

/** New-tab attributes for external links; explicit nulls for internal ones so
 *  editing an external link into an internal one clears them. The sanitizer
 *  remains authoritative at save time — these are a preview courtesy. */
const targetRelAttrs = (external: boolean): LinkTargetRel =>
  external
    ? { target: '_blank', rel: 'nofollow noopener noreferrer' }
    : { target: null, rel: null };

interface LabeledTextFieldProps {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  /** Disables the input; pair with `hint` to explain why. */
  disabled?: boolean;
  /** Muted helper line under the input, wired via aria-describedby. */
  hint?: string;
}

/** Label + Input pair used by the link and image dialogs. */
const LabeledTextField = ({
  id,
  label,
  value,
  onValueChange,
  placeholder,
  type = 'text',
  disabled = false,
  hint,
}: LabeledTextFieldProps): JSX.Element => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      disabled={disabled}
      aria-describedby={hint ? `${id}-hint` : undefined}
    />
    {hint ? (
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {hint}
      </p>
    ) : null}
  </div>
);

interface LinkBubbleMenuProps {
  editor: Editor;
  onEdit: () => void;
  onRemove: () => void;
}

/** Floating Edit/Unlink menu shown while the caret sits inside a link. */
const LinkBubbleMenu = ({ editor, onEdit, onRemove }: LinkBubbleMenuProps): JSX.Element => (
  <BubbleMenu editor={editor} shouldShow={({ editor: instance }) => instance.isActive('link')}>
    <div className="bg-popover flex items-center gap-1 rounded-md border p-1 shadow-md">
      <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
        <Pencil className="size-3.5" aria-hidden />
        Edit
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
        <Link2Off className="size-3.5" aria-hidden />
        Unlink
      </Button>
    </div>
  </BubbleMenu>
);

const isActive = (instance: Editor | null, name: string, attrs?: object): boolean =>
  instance?.isActive(name, attrs) ?? false;

/** Derive active-state flags from the editor for the toolbar. */
const selectToolbarState = ({ editor: instance }: { editor: Editor | null }): ToolbarState => ({
  isBold: isActive(instance, 'bold'),
  isItalic: isActive(instance, 'italic'),
  isLink: isActive(instance, 'link'),
  isHeading2: isActive(instance, 'heading', { level: 2 }),
  isHeading3: isActive(instance, 'heading', { level: 3 }),
  isBulletList: isActive(instance, 'bulletList'),
  isOrderedList: isActive(instance, 'orderedList'),
});

/** All-inactive fallback used before the editor instance is ready. */
const INACTIVE_TOOLBAR: ToolbarState = {
  isBold: false,
  isItalic: false,
  isLink: false,
  isHeading2: false,
  isHeading3: false,
  isBulletList: false,
  isOrderedList: false,
};

/**
 * Minimal Tiptap rich-text editor for the artist bio fields. Toolbar: bold,
 * italic, headings, lists, font-size, link (anchor text + new-tab switch,
 * internal-aware), insert-image (from the artist's images, inserted as a
 * `bioFigure` with optional title/subtitle/attribution captions), new
 * paragraph, and a preview toggle that swaps the editing surface for the
 * public-site renderer (`BioHtml`) so admins see the bio exactly as visitors
 * will — real links and CDN images. A bubble menu over active links offers
 * Edit/Unlink, and palette tiles drop straight into the text as links or
 * figures (`handleBioEditorDrop`). Output HTML is sanitized again on save
 * (`sanitizeBioHtml`).
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
  const [linkText, setLinkText] = useState('');
  // True when the dialog targets a selection or an existing link — that path
  // keeps the document's own text, so the anchor-text field is locked to stop
  // admins typing into a value that would be ignored.
  const [linkTextLocked, setLinkTextLocked] = useState(false);
  const [linkExternal, setLinkExternal] = useState(true);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageTitle, setImageTitle] = useState('');
  const [imageSubtitle, setImageSubtitle] = useState('');
  const [imageAttribution, setImageAttribution] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  // The last HTML this editor emitted, so the value-sync effect can recognize
  // its own change echoing back through the controlled `value` and skip the
  // expensive full-document getHTML() serialization on every keystroke.
  const lastEmittedHtml = useRef<string | null>(null);
  // useEditor's options close over nothing editor-shaped (the instance doesn't
  // exist yet), so handleDrop reaches the editor through this ref instead.
  const editorRef = useRef<Editor | null>(null);

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
      // Legacy <img> bios must still parse, so BioEditorImage stays registered
      // alongside the figure node new inserts use.
      BioEditorImage,
      BioFigure,
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
      handleDrop: (view, event, _slice, moved) =>
        editorRef.current ? handleBioEditorDrop(editorRef.current, view, event, moved) : false,
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      lastEmittedHtml.current = html;
      onChange(html);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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

  const toolbarState = useEditorState({ editor, selector: selectToolbarState });

  if (!editor) {
    return <div className={cn('border-input border', className)} aria-busy="true" />;
  }

  const openLinkDialog = (): void => {
    const href: string = editor.getAttributes('link').href ?? '';
    const { empty, from, to } = editor.state.selection;
    setLinkUrl(href);
    setLinkText(empty ? '' : editor.state.doc.textBetween(from, to, ' '));
    setLinkTextLocked(!empty || editor.isActive('link'));
    setLinkExternal(href ? !isInternalBioUrl(href) : true);
    setLinkOpen(true);
  };

  /** URL edits re-derive the new-tab default; the switch stays overridable. */
  const handleLinkUrlChange = (nextUrl: string): void => {
    setLinkUrl(nextUrl);
    setLinkExternal(!isInternalBioUrl(nextUrl));
  };

  const applyLink = (): void => {
    const href = linkUrl.trim();
    if (!isValidBioLinkUrl(href)) return;
    const attrs = { href, ...targetRelAttrs(linkExternal) };
    const anchorText = linkText.trim();
    // linkTextLocked mirrors the selection state captured when the dialog
    // opened (the dialog is modal, so it cannot change underneath us) and
    // keeps this branch consistent with the disabled anchor-text field.
    if (linkTextLocked) {
      editor.chain().focus().extendMarkRange('link').setLink(attrs).run();
    } else if (anchorText) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: anchorText, marks: [{ type: 'link', attrs }] })
        .run();
    }
    setLinkOpen(false);
  };

  const removeLink = (): void => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
  };

  /** Closes the image dialog, clearing the caption fields so the next insert
   *  starts fresh. */
  const handleImageOpenChange = (open: boolean): void => {
    setImageOpen(open);
    if (!open) {
      setImageTitle('');
      setImageSubtitle('');
      setImageAttribution('');
    }
  };

  const insertImage = (image: RichTextEditorImage): void => {
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'bioFigure',
        attrs: {
          src: image.url,
          alt: image.alt ?? '',
          title: imageTitle.trim() || null,
          subtitle: imageSubtitle.trim() || null,
          attribution: imageAttribution.trim() || null,
        },
      })
      .run();
    handleImageOpenChange(false);
  };

  return (
    <div className={cn('border-input border', className)}>
      <RichTextEditorToolbar
        editor={editor}
        toolbarState={toolbarState ?? INACTIVE_TOOLBAR}
        images={images}
        onOpenLink={openLinkDialog}
        onOpenImage={() => setImageOpen(true)}
        isPreview={previewOpen}
        onTogglePreview={() => setPreviewOpen((open) => !open)}
      />

      {/* Keep the editor mounted (state, undo history) while previewing — just
          hide it and render the same component the public site uses. */}
      <div hidden={previewOpen}>
        <EditorContent editor={editor} />
      </div>

      <LinkBubbleMenu editor={editor} onEdit={openLinkDialog} onRemove={removeLink} />
      {/* Mirrors the public bio page's article styling (artist-bio-content) so
          the preview matches what visitors will see. */}
      {previewOpen && (
        <div role="region" aria-label={`${ariaLabel ?? 'Bio editor'} preview`}>
          <BioHtml
            html={value}
            className="min-h-40 max-w-none px-3 py-2 [&_h2]:mt-10 [&_h2]:border-t [&_h2]:pt-6 [&_h3]:mt-6"
          />
        </div>
      )}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insert link</DialogTitle>
            <DialogDescription>
              Enter an http(s) URL or a site-relative path like /releases/slug.
            </DialogDescription>
          </DialogHeader>
          <LabeledTextField
            id="rte-link-text"
            label="Anchor text"
            placeholder="Linked text"
            value={linkText}
            onValueChange={setLinkText}
            disabled={linkTextLocked}
            hint={linkTextLocked ? 'The existing text is kept — edit it in the editor.' : undefined}
          />
          <LabeledTextField
            id="rte-link-url"
            label="URL"
            type="url"
            placeholder="https://example.com"
            value={linkUrl}
            onValueChange={handleLinkUrlChange}
          />
          <div className="flex items-center gap-2">
            <Switch
              id="rte-link-external"
              checked={linkExternal}
              onCheckedChange={setLinkExternal}
            />
            <Label htmlFor="rte-link-external">Opens in new tab</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={removeLink}>
              <Link2Off className="size-4" aria-hidden />
              Remove
            </Button>
            <Button type="button" onClick={applyLink} disabled={!isValidBioLinkUrl(linkUrl.trim())}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imageOpen} onOpenChange={handleImageOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insert image</DialogTitle>
            <DialogDescription>
              Choose one of this artist&apos;s images. Caption lines are optional.
            </DialogDescription>
          </DialogHeader>
          <LabeledTextField
            id="rte-image-title"
            label="Title"
            value={imageTitle}
            onValueChange={setImageTitle}
          />
          <LabeledTextField
            id="rte-image-subtitle"
            label="Subtitle"
            value={imageSubtitle}
            onValueChange={setImageSubtitle}
          />
          <LabeledTextField
            id="rte-image-attribution"
            label="Attribution"
            value={imageAttribution}
            onValueChange={setImageAttribution}
          />
          <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
            {images.map((image) => (
              <li key={image.url}>
                <button
                  type="button"
                  aria-label={`Insert ${image.alt ?? 'image'}`}
                  className="ring-border focus-visible:ring-primary block overflow-hidden ring-1 focus-visible:ring-2 focus-visible:outline-none"
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

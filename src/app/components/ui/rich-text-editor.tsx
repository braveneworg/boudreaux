/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import NextImage from 'next/image';

import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Link2Off } from 'lucide-react';

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
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';
import { isValidBioLinkUrl } from '@/lib/utils/is-valid-bio-link-url';

import { handleBioEditorDrop } from './bio-editor-drop';
import { BioFigure } from './bio-figure-extension';
import { BioLink } from './bio-link-extension';
import { RichTextEditorToolbar } from './rich-text-editor-toolbar';

import type { BioLinkAttributes } from './bio-link-extension';
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
  /** Called once with the editor instance when TipTap finishes initialising. */
  onEditorReady?: (editor: Editor) => void;
  /** Called each time this editor gains focus. */
  onEditorFocus?: () => void;
}

interface LabeledTextFieldProps {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
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

interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkUrl: string;
  linkText: string;
  linkExternal: boolean;
  onLinkUrlChange: (url: string) => void;
  onLinkTextChange: (text: string) => void;
  onLinkExternalChange: (external: boolean) => void;
  onApply: () => void;
  onRemove: () => void;
}

const LinkDialog = ({
  open,
  onOpenChange,
  linkUrl,
  linkText,
  linkExternal,
  onLinkUrlChange,
  onLinkTextChange,
  onLinkExternalChange,
  onApply,
  onRemove,
}: LinkDialogProps): JSX.Element => (
  <Dialog open={open} onOpenChange={onOpenChange}>
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
        onValueChange={onLinkTextChange}
      />
      <LabeledTextField
        id="rte-link-url"
        label="URL"
        type="url"
        placeholder="https://example.com"
        value={linkUrl}
        onValueChange={onLinkUrlChange}
      />
      <div className="flex items-center gap-2">
        <Switch
          id="rte-link-external"
          checked={linkExternal}
          onCheckedChange={onLinkExternalChange}
        />
        <Label htmlFor="rte-link-external">Opens in new tab</Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onRemove}>
          <Link2Off className="size-4" aria-hidden />
          Remove
        </Button>
        <Button
          type="button"
          onClick={onApply}
          disabled={!isValidBioLinkUrl(linkUrl.trim()) || !linkText.trim()}
        >
          Apply
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

interface ImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: RichTextEditorImage[];
  imageTitle: string;
  imageSubtitle: string;
  imageAttribution: string;
  onImageTitleChange: (v: string) => void;
  onImageSubtitleChange: (v: string) => void;
  onImageAttributionChange: (v: string) => void;
  onInsertImage: (image: RichTextEditorImage) => void;
}

const ImageDialog = ({
  open,
  onOpenChange,
  images,
  imageTitle,
  imageSubtitle,
  imageAttribution,
  onImageTitleChange,
  onImageSubtitleChange,
  onImageAttributionChange,
  onInsertImage,
}: ImageDialogProps): JSX.Element => (
  <Dialog open={open} onOpenChange={onOpenChange}>
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
        onValueChange={onImageTitleChange}
      />
      <LabeledTextField
        id="rte-image-subtitle"
        label="Subtitle"
        value={imageSubtitle}
        onValueChange={onImageSubtitleChange}
      />
      <LabeledTextField
        id="rte-image-attribution"
        label="Attribution"
        value={imageAttribution}
        onValueChange={onImageAttributionChange}
      />
      <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
        {images.map((image) => (
          <li key={image.url}>
            <button
              type="button"
              aria-label={`Insert ${image.alt ?? 'image'}`}
              className="ring-border focus-visible:ring-primary block overflow-hidden ring-1 focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => onInsertImage(image)}
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
);

const isActive = (instance: Editor | null, name: string, attrs?: object): boolean =>
  instance?.isActive(name, attrs) ?? false;

/** Derive active-state flags from the editor for the toolbar. */
const selectToolbarState = ({ editor: instance }: { editor: Editor | null }): ToolbarState => ({
  isBold: isActive(instance, 'bold'),
  isItalic: isActive(instance, 'italic'),
  isLink: isActive(instance, 'bioLink'),
  isImage: isActive(instance, 'bioFigure'),
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
  isImage: false,
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
 * will — real links and CDN images. Links are bioLink atom nodes with their
 * own edit/remove controls (NodeView pencil and X). Palette tiles drop
 * straight into the text as bioLink nodes or bioFigure nodes
 * (`handleBioEditorDrop`). Output HTML is sanitized again on save
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
  onEditorReady,
  onEditorFocus,
}: RichTextEditorProps): JSX.Element => {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  /** null = inserting a new node; number = position of the node being edited. */
  const [editLinkPos, setEditLinkPos] = useState<number | null>(null);
  const [linkExternal, setLinkExternal] = useState(true);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageTitle, setImageTitle] = useState('');
  const [imageSubtitle, setImageSubtitle] = useState('');
  const [imageAttribution, setImageAttribution] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const lastEmittedHtml = useRef<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const onEditRequestRef = useRef<((pos: number) => void) | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: false,
      }),
      BioLink.configure({
        onEditRequest: (pos) => onEditRequestRef.current?.(pos),
      }),
      TextStyle,
      FontSize,
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
    onCreate: ({ editor: instance }) => {
      onEditorReady?.(instance);
    },
    onFocus: () => {
      onEditorFocus?.();
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

  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedHtml.current) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  const openLinkDialogForNode = useCallback((pos: number): void => {
    const instance = editorRef.current;
    if (!instance) return;
    const node = instance.state.doc.nodeAt(pos);
    if (node?.type.name !== 'bioLink') return;
    const attrs = node.attrs as BioLinkAttributes;
    setEditLinkPos(pos);
    setLinkUrl(attrs.href);
    setLinkText(attrs.text);
    setLinkExternal(attrs.external);
    setLinkOpen(true);
  }, []);

  useEffect(() => {
    onEditRequestRef.current = openLinkDialogForNode;
  }, [openLinkDialogForNode]);

  const toolbarState = useEditorState({ editor, selector: selectToolbarState });

  if (!editor) {
    return <div className={cn('border-input border', className)} aria-busy="true" />;
  }

  const openLinkDialog = (): void => {
    const { selection } = editor.state;
    const selectedNode =
      'node' in selection ? (selection as { node?: { type: { name: string } } }).node : undefined;
    if (selectedNode?.type.name === 'bioLink') {
      openLinkDialogForNode(selection.from);
      return;
    }
    const { empty, from, to } = editor.state.selection;
    setEditLinkPos(null);
    setLinkUrl('');
    setLinkText(empty ? '' : editor.state.doc.textBetween(from, to, ' '));
    setLinkExternal(true);
    setLinkOpen(true);
  };

  const handleLinkUrlChange = (nextUrl: string): void => {
    setLinkUrl(nextUrl);
    setLinkExternal(!isInternalBioUrl(nextUrl));
  };

  const applyLink = (): void => {
    const href = linkUrl.trim();
    const text = linkText.trim();
    if (!isValidBioLinkUrl(href) || !text) return;
    const attrs: BioLinkAttributes = { href, text, external: linkExternal };
    if (editLinkPos !== null) {
      editor
        .chain()
        .focus()
        .command(({ tr, state }) => {
          const node = state.doc.nodeAt(editLinkPos);
          if (node?.type.name !== 'bioLink') return false;
          tr.setNodeMarkup(editLinkPos, undefined, attrs);
          return true;
        })
        .run();
    } else {
      editor.chain().focus().insertContent({ type: 'bioLink', attrs }).run();
    }
    setLinkOpen(false);
  };

  const removeLink = (): void => {
    if (editLinkPos !== null) {
      let removeSucceeded = false;
      editor
        .chain()
        .focus()
        .command(({ tr, state }) => {
          const node = state.doc.nodeAt(editLinkPos);
          if (node?.type.name !== 'bioLink') return false;
          removeSucceeded = true;
          tr.delete(editLinkPos, editLinkPos + node.nodeSize);
          return true;
        })
        .run();
      // Only close the dialog and reset if the remove actually succeeded
      if (removeSucceeded) {
        setLinkOpen(false);
        setEditLinkPos(null);
      }
    } else {
      // editLinkPos is null, so we're in insert mode (nothing to remove)
      setLinkOpen(false);
    }
  };

  const handleLinkDialogOpenChange = (open: boolean): void => {
    setLinkOpen(open);
    if (!open) {
      setEditLinkPos(null);
    }
  };

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
      <div hidden={previewOpen}>
        <EditorContent editor={editor} />
      </div>
      {previewOpen && (
        <div role="region" aria-label={`${ariaLabel ?? 'Bio editor'} preview`}>
          <BioHtml
            html={value}
            className="min-h-40 max-w-none px-3 py-2 [&_h2]:mt-10 [&_h2]:border-t [&_h2]:pt-6 [&_h3]:mt-6"
          />
        </div>
      )}
      <LinkDialog
        open={linkOpen}
        onOpenChange={handleLinkDialogOpenChange}
        linkUrl={linkUrl}
        linkText={linkText}
        linkExternal={linkExternal}
        onLinkUrlChange={handleLinkUrlChange}
        onLinkTextChange={setLinkText}
        onLinkExternalChange={setLinkExternal}
        onApply={applyLink}
        onRemove={removeLink}
      />
      <ImageDialog
        open={imageOpen}
        onOpenChange={handleImageOpenChange}
        images={images}
        imageTitle={imageTitle}
        imageSubtitle={imageSubtitle}
        imageAttribution={imageAttribution}
        onImageTitleChange={setImageTitle}
        onImageSubtitleChange={setImageSubtitle}
        onImageAttributionChange={setImageAttribution}
        onInsertImage={insertImage}
      />
    </div>
  );
};

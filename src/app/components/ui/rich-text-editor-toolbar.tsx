/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import {
  Bold,
  Eye,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Type,
} from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';

import type { RichTextEditorImage } from './rich-text-editor';
import type { Editor } from '@tiptap/react';

/** Font-size presets offered in the toolbar dropdown. */
const FONT_SIZES = [
  { label: 'Small', value: '14px' },
  { label: 'Normal', value: '16px' },
  { label: 'Large', value: '20px' },
  { label: 'Extra large', value: '24px' },
] as const;

/** Snapshot of toolbar active states derived via `useEditorState`. */
export interface ToolbarState {
  isBold: boolean;
  isItalic: boolean;
  isLink: boolean;
  isHeading2: boolean;
  isHeading3: boolean;
  isBulletList: boolean;
  isOrderedList: boolean;
}

interface RichTextEditorToolbarProps {
  editor: Editor;
  toolbarState: ToolbarState;
  images: RichTextEditorImage[];
  onOpenLink: () => void;
  onOpenImage: () => void;
  /** Whether the editor is showing the rendered preview instead of the editing surface. */
  isPreview: boolean;
  onTogglePreview: () => void;
}

/** Returns 'secondary' when active, 'ghost' otherwise — keeps JSX ternary-free. */
const activeVariant = (active: boolean): 'secondary' | 'ghost' => (active ? 'secondary' : 'ghost');

/**
 * Formatting toolbar for the RichTextEditor. Renders bold, italic, headings,
 * lists, font-size dropdown, link, image, and new-paragraph controls, plus a
 * preview toggle. While previewing, the formatting controls are disabled (the
 * editing surface is hidden) via the wrapping fieldset.
 */
export const RichTextEditorToolbar = ({
  editor,
  toolbarState,
  images,
  onOpenLink,
  onOpenImage,
  isPreview,
  onTogglePreview,
}: RichTextEditorToolbarProps): JSX.Element => (
  <div className="border-input flex flex-wrap items-center gap-1 border-b p-1" role="toolbar">
    <fieldset disabled={isPreview} className="contents">
      <Button
        type="button"
        size="icon"
        variant={activeVariant(toolbarState.isBold)}
        aria-label="Bold"
        aria-pressed={toolbarState.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={activeVariant(toolbarState.isItalic)}
        aria-label="Italic"
        aria-pressed={toolbarState.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" aria-hidden />
      </Button>

      <Button
        type="button"
        size="icon"
        variant={activeVariant(toolbarState.isHeading2)}
        aria-label="Heading 2"
        aria-pressed={toolbarState.isHeading2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={activeVariant(toolbarState.isHeading3)}
        aria-label="Heading 3"
        aria-pressed={toolbarState.isHeading3}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-4" aria-hidden />
      </Button>

      <Button
        type="button"
        size="icon"
        variant={activeVariant(toolbarState.isBulletList)}
        aria-label="Bulleted list"
        aria-pressed={toolbarState.isBulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={activeVariant(toolbarState.isOrderedList)}
        aria-label="Numbered list"
        aria-pressed={toolbarState.isOrderedList}
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
        variant={activeVariant(toolbarState.isLink)}
        aria-label="Link"
        aria-pressed={toolbarState.isLink}
        onClick={onOpenLink}
      >
        <Link2 className="size-4" aria-hidden />
      </Button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Insert image"
        disabled={images.length === 0}
        onClick={onOpenImage}
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
    </fieldset>

    <Button
      type="button"
      size="icon"
      variant={activeVariant(isPreview)}
      aria-label="Preview"
      aria-pressed={isPreview}
      className="ml-auto"
      onClick={onTogglePreview}
    >
      <Eye className="size-4" aria-hidden />
    </Button>
  </div>
);

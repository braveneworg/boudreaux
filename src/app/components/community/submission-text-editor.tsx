/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, Italic, Link2 } from 'lucide-react';

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
import { cn } from '@/lib/utils';
import { isHttpUrl } from '@/lib/utils/is-http-url';

import { SUBMISSION_PROSE_CLASS } from './submission-html';

import type { Editor } from '@tiptap/react';

export interface SubmissionTextEditorProps {
  /** `about`: bold and italic. `writing`: those plus headings and links. */
  variant: 'about' | 'writing';
  value: string;
  onChange: (html: string) => void;
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
}

interface ToolbarState {
  isBold: boolean;
  isItalic: boolean;
  isHeading: boolean;
  isSubheading: boolean;
  isLink: boolean;
}

const INACTIVE: ToolbarState = {
  isBold: false,
  isItalic: false,
  isHeading: false,
  isSubheading: false,
  isLink: false,
};

const selectToolbarState = ({ editor }: { editor: Editor | null }): ToolbarState =>
  editor
    ? {
        isBold: editor.isActive('bold'),
        isItalic: editor.isActive('italic'),
        isHeading: editor.isActive('heading', { level: 2 }),
        isSubheading: editor.isActive('heading', { level: 3 }),
        isLink: editor.isActive('link'),
      }
    : INACTIVE;

/** Returns 'secondary' when active, 'ghost' otherwise. */
const activeVariant = (active: boolean): 'secondary' | 'ghost' => (active ? 'secondary' : 'ghost');

/**
 * The formatting each variant's editor can hold. Everything else StarterKit
 * offers is switched off, so a paste carrying a list, a quote or a heading the
 * field may not hold lands as plain paragraphs. The server sanitizes again:
 * this is a convenience, never the control.
 */
const extensionsFor = (variant: 'about' | 'writing') => [
  StarterKit.configure({
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    heading: variant === 'writing' ? { levels: [2, 3] } : false,
    link:
      variant === 'writing'
        ? { openOnClick: false, autolink: false, protocols: ['http', 'https'] }
        : false,
  }),
];

interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (url: string) => void;
}

const LINK_ERROR = 'Enter a full address that starts with http:// or https://';

/** Asks for one address and hands it back only when it is an http(s) URL. */
const LinkDialog = ({ open, onOpenChange, onApply }: LinkDialogProps) => {
  const inputId = useId();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      setUrl('');
      setError('');
    }
    onOpenChange(next);
  };

  const handleApply = (): void => {
    const trimmed = url.trim();
    if (!isHttpUrl(trimmed)) {
      setError(LINK_ERROR);
      return;
    }

    onApply(trimmed);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a link</DialogTitle>
          <DialogDescription>
            It counts toward the ten links a submission can have.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={inputId}>Link address</Label>
          <Input
            id={inputId}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={url}
            aria-invalid={error !== ''}
            onChange={(event) => {
              setUrl(event.target.value);
              setError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleApply();
              }
            }}
          />
          {error !== '' && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply}>
            Add link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Put `url` on the selection, or insert it as its own text when nothing is selected. */
const applyLink = (editor: Editor, url: string): void => {
  if (editor.state.selection.empty) {
    editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] })
      .run();
    return;
  }

  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
};

/**
 * The small editor for a submission's text. The about takes bold and italic;
 * the writing also takes two heading levels and links. It reports sanitized-
 * looking HTML through `onChange`, but what is stored is whatever the server's
 * allowlist keeps.
 */
export const SubmissionTextEditor = ({
  variant,
  value,
  onChange,
  ariaLabel,
  id,
  disabled = false,
}: SubmissionTextEditorProps) => {
  const [linkOpen, setLinkOpen] = useState(false);
  // The HTML this editor last reported, so an echo of it through `value` is
  // not written back into the document under the caret.
  const lastEmittedHtml = useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: extensionsFor(variant),
    content: value,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        role: 'textbox',
        'aria-multiline': 'true',
        class: cn(SUBMISSION_PROSE_CLASS, 'min-h-32 px-3 py-2 focus:outline-none'),
        ...(id ? { id } : {}),
      },
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      lastEmittedHtml.current = html;
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor || value === lastEmittedHtml.current) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const toolbarState = useEditorState({ editor, selector: selectToolbarState }) ?? INACTIVE;

  if (!editor) {
    return <div className="border-input bg-muted/30 min-h-44 animate-pulse rounded-md border" />;
  }

  const isWriting = variant === 'writing';

  return (
    <div className="border-input focus-within:ring-ring/50 rounded-md border focus-within:ring-[3px]">
      <div
        role="toolbar"
        aria-label={`${ariaLabel} formatting`}
        className="border-input border-b p-1"
      >
        <fieldset disabled={disabled} className="flex flex-wrap items-center gap-1">
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
          {isWriting && (
            <>
              <Button
                type="button"
                size="icon"
                variant={activeVariant(toolbarState.isHeading)}
                aria-label="Heading"
                aria-pressed={toolbarState.isHeading}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              >
                <Heading2 className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={activeVariant(toolbarState.isSubheading)}
                aria-label="Subheading"
                aria-pressed={toolbarState.isSubheading}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              >
                <Heading3 className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={activeVariant(toolbarState.isLink)}
                aria-label="Link"
                aria-pressed={toolbarState.isLink}
                onClick={() => setLinkOpen(true)}
              >
                <Link2 className="size-4" aria-hidden />
              </Button>
            </>
          )}
        </fieldset>
      </div>
      <EditorContent editor={editor} />
      {isWriting && (
        <LinkDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          onApply={(url) => applyLink(editor, url)}
        />
      )}
    </div>
  );
};

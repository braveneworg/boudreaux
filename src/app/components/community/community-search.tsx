/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { GravatarAvatar } from '@/app/components/gravatar-avatar';
import { SearchComboboxTrigger } from '@/app/components/search-combobox-trigger';
import { SEARCH_RESULT_ITEM_CLASS, SearchResultRow } from '@/app/components/search-result-row';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useSubmissionSearchQuery } from '@/hooks/queries/use-submission-search-query';
import { useDebounce } from '@/hooks/use-debounce';
import { useHydrated } from '@/hooks/use-hydrated';
import { submissionPath } from '@/lib/community/community-paths';
import { NAMELESS_OWNER } from '@/lib/constants/submissions';
import { cn } from '@/lib/utils';

const SEARCH_LABEL = 'Search submissions';
const SEARCH_PLACEHOLDER = 'Search by title, about or username';

/** How long typing must pause before a term is searched for, in milliseconds. */
const DEBOUNCE_MS = 300;

/** The avatar's edge in pixels, asked of Gravatar at twice its drawn size. */
const AVATAR_PIXELS = 64;

export interface CommunitySearchProps {
  className?: string;
}

/**
 * The community page's search: the shared zine search trigger opens a
 * keyboard-navigable dropdown of the listed submissions whose title, about
 * or owner's username holds what was typed, newest first. Before anything is
 * typed it suggests the newest. Each match shows the owner's avatar, the
 * title and the username; choosing one opens that submission's page.
 *
 * It is a jump to one submission and does not filter the page beneath it.
 * Nothing is fetched until it is first opened. The server provides the
 * matches, so cmdk's own filtering is off.
 */
export const CommunitySearch = ({ className }: CommunitySearchProps) => {
  const router = useRouter();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, DEBOUNCE_MS).trim();
  const { data, isFetching } = useSubmissionSearchQuery(search, { enabled: open });
  const matches = data ?? [];
  const hasQuery = searchInput.trim().length > 0;

  const handleSelect = (id: string): void => {
    setOpen(false);
    router.push(submissionPath(id));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SearchComboboxTrigger
          aria-expanded={open}
          aria-label={SEARCH_LABEL}
          // "false" in the server markup, "true" once the click handler is
          // attached: an E2E click must wait for it or the click is lost.
          data-hydrated={hydrated}
          label={hasQuery ? searchInput : SEARCH_PLACEHOLDER}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        {/* Server provides the matches; disable cmdk's client-side filtering. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={searchInput}
            onValueChange={setSearchInput}
            placeholder={SEARCH_PLACEHOLDER}
            aria-label={SEARCH_LABEL}
          />
          <CommandList>
            <CommandEmpty>{isFetching ? 'Searching…' : 'No results yet.'}</CommandEmpty>
            <CommandGroup>
              {matches.map(({ id, title, owner }) => (
                <CommandItem
                  key={id}
                  value={id}
                  onSelect={() => handleSelect(id)}
                  className={cn(SEARCH_RESULT_ITEM_CLASS)}
                >
                  <SearchResultRow
                    thumbnail={
                      <GravatarAvatar
                        hash={owner.gravatarHash}
                        size={AVATAR_PIXELS}
                        defaultStyle="identicon"
                        alt=""
                        className="size-8 shrink-0 border-black"
                      />
                    }
                    primary={title === '' ? 'Untitled' : title}
                    secondary={owner.username ?? NAMELESS_OWNER}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

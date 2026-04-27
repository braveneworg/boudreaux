/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { ChevronsUpDown } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useDebounce } from '@/app/hooks/use-debounce';
import { useNotificationBannerSearchQuery } from '@/app/hooks/use-notification-banner-search-query';

interface SearchResult {
  id: string;
  content: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  slotNumber: number;
  createdAt: string;
}

interface NotificationSearchProps {
  onSelect: (notification: {
    id: string;
    content: string | null;
    textColor: string | null;
    backgroundColor: string | null;
  }) => void;
}

export function NotificationSearch({ onSelect }: NotificationSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const debouncedSearch = useDebounce(searchValue, 300);
  const { isPending: isLoading, data } = useNotificationBannerSearchQuery(debouncedSearch, open);
  const results = data?.notifications ?? [];

  const handleSelect = (notification: SearchResult) => {
    onSelect({
      id: notification.id,
      content: notification.content,
      textColor: notification.textColor,
      backgroundColor: notification.backgroundColor,
    });
    setOpen(false);
    setSearchValue('');
  };

  const stripHtml = (html: string): string => {
    return html.replace(/<[^>]*>/g, '');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-sm font-normal"
        >
          Search past notifications...
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by content..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          {isLoading && (
            <div className="text-zinc-950-foreground py-6 text-center text-sm">Searching...</div>
          )}
          {!isLoading && (
            <>
              <CommandEmpty>No past notifications found.</CommandEmpty>
              <CommandList>
                <CommandGroup>
                  {results.map((notification) => (
                    <CommandItem
                      key={notification.id}
                      value={notification.id}
                      onSelect={() => handleSelect(notification)}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm">
                          {notification.content
                            ? stripHtml(notification.content).slice(0, 80)
                            : '(empty)'}
                        </span>
                        <span className="text-zinc-950-foreground text-xs">
                          Slot {notification.slotNumber} &middot;{' '}
                          {new Date(notification.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

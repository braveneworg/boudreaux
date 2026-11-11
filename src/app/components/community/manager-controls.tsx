/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId, useState } from 'react';

import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { grantManagerAction, removeManagerAction } from '@/lib/actions/submission-actions';

export interface ManagerControlsProps {
  managers: Array<{ id: string; username: string | null }>;
}

/**
 * Where an admin grants and removes the manager role: a manager can approve
 * and reject submissions and reaches nothing else in the admin area. A change
 * holds from that user's next request, without their signing out.
 */
export const ManagerControls = ({ managers }: ManagerControlsProps) => {
  const router = useRouter();
  const usernameId = useId();
  const errorId = useId();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  const grant = async (): Promise<void> => {
    const trimmed = username.trim();
    if (trimmed === '') {
      return;
    }

    setIsWorking(true);
    setError('');
    const result = await grantManagerAction({ username: trimmed });
    setIsWorking(false);

    if (!result.success) {
      setError(result.fieldErrors?.username?.at(0) ?? result.error);
      return;
    }

    toast.success(`${result.data.username} is now a manager.`);
    setUsername('');
    router.refresh();
  };

  const remove = async (target: string): Promise<void> => {
    setIsWorking(true);
    const result = await removeManagerAction({ username: target });
    setIsWorking(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`${result.data.username} is no longer a manager.`);
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <form
        className="max-w-md space-y-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void grant();
        }}
      >
        <Label htmlFor={usernameId}>Username</Label>
        <div className="flex min-w-0 items-center gap-2">
          <Input
            id={usernameId}
            value={username}
            autoComplete="off"
            aria-invalid={error !== ''}
            aria-describedby={error !== '' ? errorId : undefined}
            className="min-w-0 flex-1"
            onChange={(event) => {
              setUsername(event.target.value);
              setError('');
            }}
          />
          <Button type="submit" disabled={isWorking}>
            Make manager
          </Button>
        </div>
        {error !== '' && (
          <p id={errorId} role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </form>

      {managers.length === 0 ? (
        <p className="text-sm">No managers yet. Admins approve everything.</p>
      ) : (
        <ul aria-label="Managers" className="max-w-md divide-y border-y">
          {managers.map(({ id, username: name }) => (
            <li key={id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate font-medium">{name ?? 'No username'}</span>
              {name !== null && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isWorking}
                  aria-label={`Remove ${name}`}
                  onClick={() => void remove(name)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

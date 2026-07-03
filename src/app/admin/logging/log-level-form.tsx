/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { Loader2, RotateCcw, Save } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Label } from '@/components/ui/label';
import { setLogLevelAction } from '@/lib/actions/set-log-level-action';
import type { LogLevel, LogLevelState } from '@/lib/utils/logger';

interface LogLevelFormProps {
  initialState: LogLevelState;
}

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const DURATION_OPTIONS = [
  { value: '15', label: '15 minutes' },
  { value: '60', label: '1 hour' },
  { value: '240', label: '4 hours' },
] as const;

export const LogLevelForm = ({ initialState }: LogLevelFormProps) => {
  const router = useRouter();
  const [state, setState] = useState<LogLevelState>(initialState);
  const [level, setLevel] = useState<LogLevel>(initialState.effectiveLevel);
  const [duration, setDuration] = useState<string>('60');
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const submit = async (nextLevel: LogLevel | null) => {
    setIsPending(true);
    setMessage(null);
    try {
      const result = await setLogLevelAction(
        nextLevel === null
          ? { level: null }
          : { level: nextLevel, ttlMinutes: parseInt(duration, 10) }
      );
      if (result.success) {
        setState(result.state);
        setLevel(result.state.effectiveLevel);
        setMessage({
          type: 'success',
          text:
            nextLevel === null
              ? `Override cleared — back to the configured "${result.state.configuredLevel}" level.`
              : `Log level set to "${nextLevel}".`,
        });
        router.refresh();
      } else {
        setMessage({
          type: 'error',
          text: result.error === 'unauthorized' ? 'Not authorized.' : 'Invalid log level request.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="border p-4">
      <h3 className="mb-1 text-lg font-semibold">Runtime Log Level</h3>
      <p className="text-muted-foreground mb-4 text-sm">
        Configured default: <span className="font-medium">{state.configuredLevel}</span>
        {state.override ? (
          <>
            {' · '}active override: <span className="font-medium">{state.override}</span>
            {state.expiresAt
              ? ` (reverts ${new Date(state.expiresAt).toLocaleTimeString()})`
              : ' (until reset or restart)'}
          </>
        ) : (
          ' · no override active'
        )}
      </p>

      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Level</legend>
          <RadioGroup
            value={level}
            onValueChange={(value) => setLevel(value as LogLevel)}
            className="flex flex-wrap gap-4"
          >
            {LOG_LEVELS.map((value) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem id={`log-level-${value}`} value={value} />
                <Label htmlFor={`log-level-${value}`}>{value}</Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="log-level-duration">Revert after</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger id="log-level-duration" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="button" size="sm" disabled={isPending} onClick={() => submit(level)}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Apply
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending || state.override === null}
            onClick={() => submit(null)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to default
          </Button>
        </div>
      </div>

      {message && (
        <p
          role="status"
          className={`mt-3 text-sm ${message.type === 'success' ? 'text-green-600' : 'text-destructive'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
};

<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Mutation hooks ↔ forms workflow

How the admin forms talk to the custom TanStack Query mutation hooks
(`src/app/hooks/mutations/`), the shared form utilities, and the Server Actions
after the "idiomatic mutation hooks" refactor.

## 1. The contract at a glance

Each form-backed hook now **accepts validated Zod values**, serializes them to
`FormData` internally, and **returns destructured, renamed props** instead of the
raw `useMutation` object.

```mermaid
flowchart LR
  subgraph Hook["useCreateXMutation()"]
    direction TB
    IN["values: XCreateInput\n(Zod-inferred)"]
    O2F["objectToFormData(values)"]
    ACT["xCreateAction(EMPTY_FORM_STATE, formData)"]
    UM["useMutation()"]
    OUT["{ createX, createXAsync,\n  isCreatingX, isCreateXError,\n  createXError, createdX,\n  resetCreateX }"]
    IN --> O2F --> ACT --> UM --> OUT
  end
```

- **Input** — `XCreateInput` for create, `{ id, values: XUpdateInput }` for update.
- **`objectToFormData`** (`src/lib/utils/forms/object-to-form-data.ts`) — skips
  `null`/`undefined`; omits empty strings (create) or keeps them (`keepEmptyStrings`
  for update flows that clear fields); JSON-encodes arrays, or appends each item
  individually for keys in `repeatKeys` (e.g. featured-artist `artistIds`).
- **`EMPTY_FORM_STATE`** (`src/lib/types/form-state.ts`) — the actions ignore the
  initial state, so one shared empty value replaces every hand-built `formState`.
- **Output** — named props; multiple hooks read cleanly side by side
  (`isCreatingTour || isUpdatingTour`).

## 2. Submit sequence (create / update form)

```mermaid
sequenceDiagram
  participant U as User
  participant F as Form (RHF)
  participant H as useXMutation hook
  participant S as objectToFormData
  participant A as Server Action
  participant Q as QueryClient

  U->>F: submit
  F->>F: handleSubmit → zodResolver validates
  alt invalid
    F-->>U: field errors (RHF) + toast
  else valid
    F->>H: createXAsync(values)  // or updateXAsync({ id, values })
    H->>S: serialize values
    S-->>H: FormData
    H->>A: xCreateAction(EMPTY_FORM_STATE, formData)
    A-->>H: FormState { success, errors?, data? }
    H->>Q: onSuccess → invalidateQueries (only if success)
    H-->>F: FormState
    alt result.success
      F-->>U: success toast + router.push/refresh
    else result.success === false
      F->>F: setFormErrors(setError, result)
      F-->>U: field errors mapped to inputs + general toast
    end
  end
```

`setFormErrors` (`src/lib/utils/forms/set-form-errors.ts`) maps
`FormState.errors` onto RHF via `setError(field, { type: 'server', message })`
and returns the reserved `general` message for the caller to toast.

## 3. Pending state wiring

Forms read the hook's renamed pending flags directly instead of a local
`useState`/`useActionState`.

```mermaid
flowchart TB
  subgraph TourForm["tour-form.tsx"]
    C["isCreatingTour"]
    Uu["isUpdatingTour"]
    D["isDeletingTour"]
    SUB["isSubmitting = isCreatingTour || isUpdatingTour"]
    C --> SUB
    Uu --> SUB
    SUB --> BTN["Submit button disabled / 'Creating…' / 'Updating…'"]
    D --> DEL["Delete button disabled / 'Deleting…'"]
  end
```

Image-heavy forms (artist, release) compose the hook flag with their own
transition/upload state:
`isSubmitting = isCreatingX || isUpdatingX || isTransitionPending || isUploadingImages`.

## 4. Hook ↔ consumer map

```mermaid
flowchart LR
  subgraph Hooks
    tour["use-tour-mutations"]
    td["use-tour-date-mutations"]
    rel["use-release-mutations"]
    art["use-artist-mutations"]
    ven["use-venue-mutations"]
    fa["use-featured-artist-mutations"]
    ban["use-banner-mutations"]
    bio["use-bio-mutations"]
  end
  subgraph Consumers
    tf["tour-form"]
    tdf["tour-date-form"]
    apl["artist-pill-list"]
    rf["release-form"]
    af["artist-form"]
    vs["venue-select"]
    faf["featured-artist-form"]
    fadv["featured-artist-data-view"]
    bsc["banner-slot-card"]
    rif["rotation-interval-form"]
    abg["artist-bio-generation-section"]
  end
  tour --> tf
  td --> tdf
  td --> apl
  rel --> rf
  art --> af
  ven --> vs
  ven --> tdf
  fa --> faf
  fa --> fadv
  ban --> bsc
  ban --> rif
  bio --> abg
```

## 5. Serialization specifics (why per-form, not one rule)

The Server Actions are unchanged, so each hook's serializer must reproduce the
encoding its action already parses:

| Hook / field                                            | Encoding                                | Decoded by                    |
| ------------------------------------------------------- | --------------------------------------- | ----------------------------- |
| most string fields                                      | `String(value)`                         | `getActionState`              |
| numbers / booleans                                      | `String(value)` (coerced back)          | `getActionState`              |
| tour-date `headlinerIds`, release `formats`/`artistIds` | `JSON.stringify`                        | `getActionState` (`[`-prefix) |
| featured-artist `artistIds`                             | repeated `append` (`repeatKeys`)        | `payload.getAll('artistIds')` |
| update flows that clear                                 | empty strings kept (`keepEmptyStrings`) | action overwrites with `''`   |

Notes:

- **tour update** keeps empty strings (clears optional fields); **artist/release
  update** omit them (preserving prior behavior — they do not clear via blanks).
- **banner-slot-card** builds the typed object from controlled local state inside
  its `useActionState` action; the schema's `preprocess` maps `''`/absent → `null`.
- **featured-artist edit** still uses the PATCH API route (no update hook exists);
  only create + cover-art go through hooks.

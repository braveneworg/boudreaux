# DatePicker — scrollable years + masked `mm/dd/yyyy` typing

Date: 2026-07-12
Status: Approved (design), pending implementation
Component: `src/app/components/ui/datepicker.tsx` (shared; 7 call sites)

## Problem

The shared `DatePicker` has two gaps:

1. **No discoverable year navigation.** The calendar caption is a plain label
   (`captionLayout="label"`); the only way to change the year is undocumented
   arrow keys (↑/↓) on the text field. Jumping across decades means clicking the
   month `‹ ›` arrows dozens of times.
2. **The text field is not genuinely typeable.** It shows a formatted value and
   accepts input, but `onChange` runs a raw `new Date(inputValue)` on every
   keystroke — no mask, no digit constraint, and it emits garbage/partial dates
   as you type. There is no `mm/dd/yyyy` guidance beyond the placeholder.

## Goals

- Add a **scrollable year** control (1900–2099) to the calendar header.
- Make the companion field **type-to-enter** a date under an `mm/dd/yyyy` mask,
  committing only complete, valid, in-range dates.
- Keep the public API (`onSelect`, `fieldName`, `value`) unchanged so all 7 call
  sites work untouched, and leave the `Calendar` primitive (`calendar.tsx`)
  unchanged.

## Decisions (agreed)

- **Header:** month **and** year dropdowns (`captionLayout="dropdown"`), year
  range 1900–2099. The `Calendar` primitive is already styled for dropdowns and
  ships the `formatMonthDropdown` short-month formatter, so no `calendar.tsx`
  change is needed.
- **Invalid/incomplete typed input on blur:** revert the field to the last valid
  committed date (or empty if none). Complete valid dates still commit live.
- **Arrow-key stepping:** removed. Now that the field is typeable, ←/→ must move
  the text cursor; ↑/↓ become no-ops. Year/month are handled by the dropdowns and
  by typing. The sr-only label is updated to describe typing + dropdowns.

## Design

### 1. New pure util — `src/lib/utils/date-mask.ts`

Two small, dependency-free functions (uses `date-fns`, already a dependency).
Isolated and independently unit-testable.

```ts
// Progressive mask: reformats any input's digits (max 8) into mm/dd/yyyy,
// inserting the slashes. Pure function of the digit string, so backspace and
// mid-string edits stay predictable.
export const maskDateInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

// Returns a Date only for a complete, real, in-range mm/dd/yyyy. Round-trips
// through format() to reject rollovers (e.g. 02/30/2023 → Mar 2), and enforces
// the 1900–2099 bound. Otherwise null.
export const parseMaskedDate = (masked: string): Date | null => {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(masked)) return null;
  const parsed = parse(masked, 'MM/dd/yyyy', new Date());
  if (!isValid(parsed)) return null;
  if (format(parsed, 'MM/dd/yyyy') !== masked) return null; // rollover guard
  const year = parsed.getFullYear();
  if (year < 1900 || year > 2099) return null;
  return parsed;
};
```

### 2. Calendar header → dropdowns (`datepicker.tsx`)

Change the `<Calendar>` props only:

- `captionLayout="label"` → `captionLayout="dropdown"`.
- Add `startMonth={startDate}` and `endMonth={endDate}` (react-day-picker v9 —
  these bound navigation and populate the year `<select>` with 1900–2099).
- Keep `disabled={{ before: startDate, after: endDate }}` as-is.

The rdp year dropdown is a native, scrollable `<select>`. The global punk-zine
border rule does not target `<select>`, so it needs no styling change.

### 3. Masked, typeable field (`datepicker.tsx`)

- Add `inputValue: string` state — the field's live text. The field renders
  `value={inputValue}` (replaces the derived `displayValue`).
- **Sync** `inputValue` from the committed `date` wherever `date` changes: the
  controlled-`value` effect and calendar day selection
  (`format(date, 'MM/dd/yyyy')`, or `''` when cleared). Month/year **dropdown
  navigation only moves the calendar view (`month`), not the selection**, so it
  must leave `inputValue` untouched.
- **onChange** — `const masked = maskDateInput(e.target.value); setInputValue(masked);`
  then `const parsed = parseMaskedDate(masked);` and, only if `parsed`, commit
  (`setDate`, `setMonth`, `onSelect(parsed.toISOString(), fieldName)`). Partial or
  invalid input updates the text but does **not** call `onSelect`.
- **onBlur** (new):
  - Empty field → commit a clear (`setDate(undefined)`, `onSelect('', fieldName)`).
  - Complete valid → already committed on change; leave as-is.
  - Partial/invalid → revert `inputValue` to `date` formatted (or `''`).
- **Remove** `handleKeyDown` / `handleYearKey` / `handleMonthKey` and the input's
  `onKeyDown`. Update the sr-only `Label` text accordingly.

`onSelect` continues to emit `date.toISOString()` for typed dates, matching the
existing calendar-selection behavior exactly (no change to what consumers receive).

## Testing (TDD, spec-first)

- **New `src/lib/utils/date-mask.spec.ts`:**
  - `maskDateInput`: `"05122023"→"05/12/2023"`, `"051"→"05/1"`, `"5"→"5"`,
    strips non-digits, caps at 8 digits.
  - `parseMaskedDate`: valid full date parses; rejects incomplete (`"05/1"`),
    out-of-range month/day (`"13/45/2023"`), rollover (`"02/30/2023"`), and
    years outside 1900–2099.
- **Extend `datepicker.spec.tsx`:**
  - Typing a full valid date calls `onSelect` with the correct ISO Y/M/D.
  - Typing a partial date does **not** call `onSelect`.
  - Blur on a partial reverts the field to the last valid value.
  - Blur on an emptied field commits a clear (`onSelect('', fieldName)`).
  - The header exposes a year dropdown listing 1900 and 2099.
  - The existing 5 tests (controlled display, open/close, day-select, clear)
    remain green.

## Scope / backward-compatibility

- Public props unchanged (`onSelect`, `fieldName`, `value`); all 7 call sites
  untouched (tours datetime, banner slot, artist dates, release basic-info,
  display settings, video metadata, video publish).
- `calendar.tsx` untouched.
- Behavior change: keyboard arrow-key date stepping is removed (replaced by
  dropdowns + typing). No call site depends on it.

## Files

- `src/lib/utils/date-mask.ts` (new) + `date-mask.spec.ts` (new)
- `src/app/components/ui/datepicker.tsx` (modified)
- `src/app/components/ui/datepicker.spec.tsx` (extended)

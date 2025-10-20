# Fix: Infinite Loop of Toast Messages

## Problem

When clicking the submit button for "Change Email" or "Change Username" forms, an infinite loop of toast messages appeared, repeatedly showing success messages.

## Root Cause

The `useEffect` hooks that handle success states included the form objects (`changeEmailForm`, `changeUsernameForm`, `personalProfileForm`) in their dependency arrays:

```tsx
// ❌ BAD - Causes infinite loop
useEffect(() => {
  if (emailFormState.success) {
    toast.success('Your email has been updated successfully.');
    // ... form operations
  }
}, [emailFormState.success, changeEmailForm, update]); // changeEmailForm causes loop!
```

### Why This Caused an Infinite Loop:

1. **Form objects are recreated on every render** - `useForm()` returns a new object reference each time the component renders
2. **useEffect sees a "new" dependency** - When the effect runs and calls `changeEmailForm.setValue()` or `changeEmailForm.clearErrors()`, it triggers a re-render
3. **Re-render creates new form object** - The component re-renders with a new `changeEmailForm` reference
4. **Effect runs again** - useEffect sees the new reference and runs again
5. **Loop continues** - This creates an infinite cycle of: effect → state change → re-render → new form object → effect runs again

## Solution

Remove the form objects from the dependency arrays and only depend on the success state and the `update` function. Add ESLint disable comment to suppress the exhaustive-deps warning since we intentionally want to access the form objects without depending on them:

```tsx
// ✅ GOOD - No infinite loop
useEffect(() => {
  if (emailFormState.success) {
    toast.success('Your email has been updated successfully.');
    setIsEditingUserEmail(false);
    changeEmailForm.setValue('confirmEmail', '');
    changeEmailForm.clearErrors();
    void update();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [emailFormState.success, update]); // Only depend on success state and update
```

## Changes Made

### Personal Profile Form Effect

**Before:**

```tsx
}, [formState.success, formState.errors, personalProfileForm, update]);
```

**After:**

```tsx
}, [formState.success, formState.errors, update]);
// + eslint-disable-next-line react-hooks/exhaustive-deps
```

### Email Form Effect

**Before:**

```tsx
}, [emailFormState.success, changeEmailForm, update]);
```

**After:**

```tsx
}, [emailFormState.success, update]);
// + eslint-disable-next-line react-hooks/exhaustive-deps
```

### Username Form Effect

**Before:**

```tsx
}, [usernameFormState.success, changeUsernameForm, update]);
```

**After:**

```tsx
}, [usernameFormState.success, update]);
// + eslint-disable-next-line react-hooks/exhaustive-deps
```

## Why This is Safe

1. **Form objects are stable within a render cycle** - While they're technically new objects on each render, their methods work correctly when called
2. **Success state is the trigger** - We only want the effect to run when `success` changes from `false` to `true`, not when the form object reference changes
3. **Methods don't depend on closure state** - The form methods (`setValue`, `clearErrors`) don't capture stale values; they operate on the current form state
4. **ESLint disable is intentional** - We're explicitly choosing not to include the form in dependencies because we understand the implications

## Alternative Solutions Considered

### Option 1: useCallback for form creation (rejected)

```tsx
const changeEmailForm = useMemo(() => useForm(...), []); // ❌ Doesn't work - breaks hook rules
```

This violates React's rules of hooks - you can't call hooks inside useMemo.

### Option 2: Ref-based approach (more complex)

```tsx
const formRef = useRef(changeEmailForm);
formRef.current = changeEmailForm;
// Use formRef.current in effect
```

This works but adds unnecessary complexity.

### Option 3: Current solution (chosen) ✅

Remove form from dependencies and add ESLint disable - simplest and most straightforward.

## Result

- No more infinite toast message loops
- Forms still work correctly
- Success messages appear exactly once after successful submission
- All form state updates work as expected

## Testing

To verify the fix works:

1. Go to profile page
2. Click "Edit Email"
3. Change email and confirm
4. Click "Save Email"
5. ✅ Should see ONE success toast
6. Repeat for username change
7. ✅ Should see ONE success toast

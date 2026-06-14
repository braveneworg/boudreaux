# Fix: setState in Render Error on Cancel Button

## Problem

Clicking the "Cancel" button on the change email form triggered the error:

```
Cannot update a component (`FormLabel`) while rendering a different component (`ProfileForm`).
To locate the bad setState() call inside `ProfileForm`, follow the stack trace as described in
https://react.dev/link/setstate-in-render
```

## Root Cause

The `handleEditFieldButtonClick` function was calling form methods (`clearErrors()` and `setValue()`) inside the `setState` updater function:

```tsx
// ❌ BAD - State updates inside setState updater
setIsEditingUserEmail((prev) => {
  if (prev) {
    changeEmailForm.clearErrors(); // ❌ setState during render
    changeEmailForm.setValue('confirmEmail', ''); // ❌ setState during render
  }
  return !prev;
});
```

This violates React's rule: **you cannot update state while computing new state for another component**, because it triggers renders during the render phase.

## Solution

Move the form method calls outside of the `setState` updater function. Check the current state value before calling `setState`, then call form methods after:

```tsx
// ✅ GOOD - State updates after setState
const wasEditing = isEditingUserEmail; // Capture current state
setIsEditingUserEmail((prev) => !prev); // Update state

// Clear errors after determining we're canceling
if (wasEditing) {
  changeEmailForm.clearErrors(); // ✅ Now safe
  changeEmailForm.setValue('confirmEmail', ''); // ✅ Now safe
}
```

## Key Changes

### Before

```tsx
const handleEditFieldButtonClick = useCallback(
  (event: React.MouseEvent<HTMLButtonElement>): void => {
    const target = event.target as HTMLButtonElement;
    const fieldName = target.getAttribute('data-field');

    if (fieldName === 'email') {
      setIsEditingUserEmail((prev) => {
        if (prev) {
          changeEmailForm.clearErrors(); // ❌ Problem here
          changeEmailForm.setValue('confirmEmail', '');
        }
        return !prev;
      });
    }
  },
  [changeEmailForm, changeUsernameForm]
);
```

### After

```tsx
const handleEditFieldButtonClick = useCallback(
  (event: React.MouseEvent<HTMLButtonElement>): void => {
    const target = event.target as HTMLButtonElement;
    const fieldName = target.getAttribute('data-field');

    if (fieldName === 'email') {
      const wasEditing = isEditingUserEmail; // ✅ Capture state first
      setIsEditingUserEmail((prev) => !prev);

      if (wasEditing) {
        // ✅ Update form after setState
        changeEmailForm.clearErrors();
        changeEmailForm.setValue('confirmEmail', '');
      }
    }
  },
  [changeEmailForm, changeUsernameForm, isEditingUserEmail, isEditingUsername]
);
```

## React Rules Followed

1. **No setState during render** - All state updates happen in event handlers
2. **No setState inside setState** - Form methods are called after, not during, the setState call
3. **Dependency array updated** - Added `isEditingUserEmail` and `isEditingUsername` to dependencies

## Result

The cancel button now works without triggering React's setState-in-render error. The form properly:

- Toggles edit mode
- Clears validation errors
- Resets confirmation fields
- Maintains correct state flow

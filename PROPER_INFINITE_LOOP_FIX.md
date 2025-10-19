# Fix: Infinite Loop Without Disabling exhaustive-deps

## Problem

The infinite loop of toast messages when saving username/email changes, but we want to fix it WITHOUT disabling the `react-hooks/exhaustive-deps` ESLint rule.

## Root Cause (Recap)

Form objects from `useForm()` are recreated on every render, causing `useEffect` hooks that depend on them to run repeatedly in an infinite loop.

## Proper Solution: useRef Pattern

Instead of disabling the ESLint rule, we use the `useRef` pattern to maintain stable references to form instances across renders.

### How It Works

1. **Create refs for each form instance**

```tsx
const personalProfileFormRef = useRef(personalProfileForm);
const changeEmailFormRef = useRef(changeEmailForm);
const changeUsernameFormRef = useRef(changeUsernameForm);
```

2. **Update refs on each render** (outside useEffect)

```tsx
personalProfileFormRef.current = personalProfileForm;
changeEmailFormRef.current = changeEmailForm;
changeUsernameFormRef.current = changeUsernameForm;
```

3. **Use refs in useEffect instead of direct form references**

```tsx
// ✅ GOOD - Uses stable ref, no exhaustive-deps needed
useEffect(() => {
  if (usernameFormState.success) {
    toast.success('Your username has been updated successfully.');
    setIsEditingUsername(false);
    changeUsernameFormRef.current.setValue('confirmUsername', '');
    changeUsernameFormRef.current.clearErrors();
    void update();
  }
}, [usernameFormState.success, update]); // No form in dependencies!
```

### Why This Works

- **Refs are stable** - `useRef` returns the same object reference across renders
- **`.current` is mutable** - We can update it without triggering re-renders
- **Effects don't re-run** - Since refs are stable, they don't cause effect dependencies to change
- **Always current** - By updating `.current` on each render, we always have access to the latest form instance
- **ESLint is happy** - No need to include refs in dependency arrays because they're stable

## Changes Made

### 1. Added useRef import

```tsx
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
```

### 2. Created refs for all forms

```tsx
const personalProfileFormRef = useRef(personalProfileForm);
const changeEmailFormRef = useRef(changeEmailForm);
const changeUsernameFormRef = useRef(changeUsernameForm);

// Update refs on each render
personalProfileFormRef.current = personalProfileForm;
changeEmailFormRef.current = changeEmailForm;
changeUsernameFormRef.current = changeUsernameForm;
```

### 3. Updated all useEffect hooks to use refs

**Before:**

```tsx
useEffect(() => {
  if (user?.email && !isEditingUserEmail) {
    changeEmailForm.setValue('email', user.email);
    changeEmailForm.setValue('previousEmail', user.email);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [user?.email, isEditingUserEmail]);
```

**After:**

```tsx
useEffect(() => {
  if (user?.email && !isEditingUserEmail) {
    changeEmailFormRef.current.setValue('email', user.email);
    changeEmailFormRef.current.setValue('previousEmail', user.email);
  }
}, [user?.email, isEditingUserEmail]); // No eslint-disable needed!
```

### 4. Updated callbacks to use refs

**Before:**

```tsx
const handleEditFieldButtonClick = useCallback(
  (event) => {
    if (wasEditing) {
      changeEmailForm.clearErrors();
      changeEmailForm.setValue('confirmEmail', '');
    }
  },
  [changeEmailForm, changeUsernameForm, isEditingUserEmail, isEditingUsername]
);
```

**After:**

```tsx
const handleEditFieldButtonClick = useCallback(
  (event) => {
    if (wasEditing) {
      changeEmailFormRef.current.clearErrors();
      changeEmailFormRef.current.setValue('confirmEmail', '');
    }
  },
  [isEditingUserEmail, isEditingUsername] // Removed form dependencies!
);
```

## Benefits of This Approach

1. ✅ **No infinite loops** - Refs provide stable references
2. ✅ **No ESLint disables** - All dependencies are properly declared
3. ✅ **Always current data** - `.current` is updated on every render
4. ✅ **React best practices** - This is the recommended pattern for this use case
5. ✅ **Type safe** - Full TypeScript support with no compromises
6. ✅ **Maintainable** - Other developers can easily understand the pattern

## Comparison: Ref Pattern vs ESLint Disable

| Aspect              | Ref Pattern (✅ Used)         | ESLint Disable (❌ Not Used)   |
| ------------------- | ----------------------------- | ------------------------------ |
| Infinite loops      | Prevented                     | Prevented                      |
| ESLint warnings     | None                          | Disabled                       |
| Code quality        | High - follows best practices | Lower - hides potential issues |
| Maintainability     | Clear intent                  | May confuse future developers  |
| React compatibility | Future-proof                  | May break with React updates   |
| Other dependencies  | Properly tracked              | Risk of missing dependencies   |

## Updated Effects

All these effects now use refs and have proper dependency arrays:

1. ✅ `personalProfileForm` population effect
2. ✅ `changeEmailForm` session update effect
3. ✅ `changeUsernameForm` session update effect
4. ✅ Email field validation watcher
5. ✅ Username field validation watcher
6. ✅ Profile update success toast
7. ✅ Email change success toast
8. ✅ Username change success toast

## Result

- ✅ No infinite toast loops
- ✅ No ESLint rule violations
- ✅ Clean, maintainable code
- ✅ Follows React best practices
- ✅ All form functionality works perfectly

This is the proper way to handle form references in React Hook Form with strict ESLint rules!

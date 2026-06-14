<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Username Profile Save Error Fix

## Problem

When saving a profile username (especially after generating a random username), users were receiving a generic "An unknown error occurred" message without any indication of what actually went wrong.

## Root Causes Identified

### 1. **Missing Zod Validation Error Handling**

The `changeUsernameAction` server action wasn't extracting validation errors from Zod when validation failed. When form validation failed (e.g., usernames don't match, invalid format), the errors from Zod's `safeParse()` result were being ignored, and no error feedback was provided to the user.

### 2. **Generic Error Messages**

When runtime errors occurred (database errors, adapter errors, etc.), all errors that weren't specific timeout or duplicate key errors were caught by a catch-all that called `setUnknownError(formState)` with the default message "An unknown error occurred", providing no context about what actually failed.

### 3. **Insufficient Error Logging**

There was no logging of actual errors on the server side, making it impossible to debug issues when they occurred in production.

## Solution Implemented

### File Modified

- **`src/lib/actions/change-username-action.ts`**

### Changes Made

#### 1. Added Zod Validation Error Extraction

```typescript
// Handle Zod validation errors
if (!parsed.success) {
  if (!formState.errors) {
    formState.errors = {};
  }

  // Extract field-level errors from Zod
  for (const [field, error] of Object.entries(parsed.error.flatten().fieldErrors)) {
    formState.errors[field] = error as string[];
  }

  // If there are general errors, add them as well
  const generalErrors = parsed.error.flatten().formErrors;
  if (generalErrors && generalErrors.length > 0) {
    formState.errors.general = generalErrors;
  }

  return formState;
}
```

When Zod validation fails (e.g., username and confirmUsername don't match), the specific validation errors are now extracted and returned to the form. Users will see the exact validation error below the problematic field.

#### 2. Enhanced Error Logging

```typescript
console.error('[changeUsernameAction] Error updating username:', {
  errorType: error instanceof Error ? error.constructor.name : typeof error,
  errorMessage: error instanceof Error ? error.message : String(error),
  errorCode: error instanceof PrismaClientKnownRequestError ? error.code : undefined,
});
```

All errors are now logged with context about the error type, message, and Prisma error codes. This helps with debugging and monitoring.

#### 3. Improved Error Messages

- **Authentication errors**: Specific message when user is not logged in
- **Duplicate username**: "Username is already taken." (already existed)
- **Timeout errors**: "Connection timed out. Please try again." (already existed)
- **Generic Prisma errors**: "Failed to update username. Please try again or contact support."
- **Unknown errors**: "Failed to update username. Please try again or contact support."

## How Errors Are Now Displayed to Users

### Validation Errors (Zod)

These appear as error messages below the specific form field:

- If usernames don't match: "Confirm username must match username"
- If username format is invalid: "Username must contain only letters, numbers, and underscores"

### General/Server Errors

These appear as toast notifications:

- Timeout: "Connection timed out. Please try again."
- Duplicate username: "Username is already taken."
- Other: "Failed to update username. Please try again or contact support."

## Testing Recommendations

1. **Test validation errors:**
   - Generate a random username
   - Manually change the confirm username field to something different
   - Click save and verify you see the specific validation error

2. **Test duplicate username:**
   - Request a username that's already taken
   - Verify you see "Username is already taken."

3. **Test success flow:**
   - Generate a random username and save it
   - Verify the success toast appears and form state updates

4. **Monitor server logs:**
   - Check server logs for `[changeUsernameAction]` entries
   - Verify error debugging information is being logged properly

## Related Files

- [change-username-action.ts](src/lib/actions/change-username-action.ts) - Server action
- [profile-form.tsx](src/app/components/forms/profile-form.tsx) - Component that uses the action
- [change-username-schema.ts](src/lib/validation/change-username-schema.ts) - Validation schema
- [text-field.tsx](src/app/components/forms/fields/text-field.tsx) - Form field component with error display

## Error Handling Flow

```
User submits username form
    ↓
Server validates with Zod
    ├─ If validation fails → Extract and return field errors
    │  (displayed below each field)
    │
    └─ If validation passes → Attempt database update
        ├─ Success → return success = true
        │  (displayed as success toast)
        │
        └─ Error → Check error type:
            ├─ Not logged in → Return auth error
            ├─ Timeout → Return timeout message
            ├─ Duplicate key → Return "Username already taken"
            ├─ Other Prisma → Return "Failed to update. Contact support"
            └─ Unknown → Return "Failed to update. Contact support"
```

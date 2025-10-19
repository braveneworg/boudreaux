# Debugging Authentication Issues

## Steps to Debug

1. **Open Browser DevTools Console** (Cmd+Option+J on Mac)
   - Look for logs starting with `[AuthToolbar]` and `[SignedInAs]`

2. **Check what the logs show:**
   - `[AuthToolbar] Session status:` should show `'authenticated'` when logged in
   - `[AuthToolbar] Session data:` should show your session object with user data
   - `[AuthToolbar] Username:` should show your username

3. **Check Browser Cookies:**
   - Open DevTools → Application → Cookies → http://localhost:3001
   - Look for cookie named:
     - `next-auth.session-token` (development)
     - `__Secure-next-auth.session-token` (production)

4. **Common Issues:**

   ### Issue: Session status is 'unauthenticated' but you're logged in
   - **Cause:** Cookie name mismatch or secure flag issue
   - **Solution:** Clear all cookies and sign in again

   ### Issue: Session status is 'authenticated' but username is undefined
   - **Cause:** User doesn't have a username set in database
   - **Solution:** Check MongoDB user document or sign up with username

   ### Issue: Session shows 'loading' forever
   - **Cause:** SessionProvider not wrapping the app or auth endpoint failing
   - **Solution:** Check network tab for /api/auth/session calls

   ### Issue: Username exists but SignedInAs component returns null
   - **Cause:** Type mismatch in session.user.username
   - **Solution:** Check console logs to see actual session structure

## Manual Test in Browser Console

Run this in the browser console while on the home page:

```javascript
// Check if SessionProvider is working
const { useSession } = require('next-auth/react');
console.log('Session hook test:', useSession());
```

## Expected Console Output When Working

```
[AuthToolbar] Session status: authenticated
[AuthToolbar] Session data: {user: {id: '...', username: 'yourname', email: '...'}, expires: '...'}
[AuthToolbar] User data: {id: '...', username: 'yourname', email: '...'}
[AuthToolbar] Username: yourname
[AuthToolbar] Rendering authenticated toolbar
[SignedInAs] Session: {user: {id: '...', username: 'yourname', email: '...'}, expires: '...'}
[SignedInAs] User: {id: '...', username: 'yourname', email: '...'}
[SignedInAs] Username: yourname
```

## What to Look For in Console

Take a screenshot of your console and share what you see for:

1. Session status
2. Session data structure
3. Whether username is present or undefined
4. Any error messages

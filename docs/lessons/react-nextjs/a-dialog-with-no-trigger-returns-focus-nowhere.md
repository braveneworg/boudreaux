# A dialog with no trigger of its own returns focus nowhere

Radix's modal `Dialog.Content` does not use its focus scope's default
return. Its `onCloseAutoFocus` prevents that default and focuses the
dialog's own trigger instead:

```js
onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
  event.preventDefault();
  context.triggerRef.current?.focus();
});
```

A dialog opened from code has no `Dialog.Trigger`, so `triggerRef` is empty
and focus is left on `<body>` when it closes. vaul's drawer is the same
dialog underneath.

## What failed

The submission modal (ADR-0030) is one controlled `ResponsiveLightbox` in
the community layout, opened by whichever card, row or search result the
visitor chose. On 2026-11-15 its first E2E run closed the modal with Escape
and found the card that opened it `inactive`. The modal had been opened
with Enter on the focused card, so a keyboard user was put back at the top
of the page after every submission they read.

Every unit spec had passed. They rendered the modal already open, or stood
a stand-in in its place, and none asked where focus was after a close.

A mouse click hid a second cause. A card in a submission row sits inside
the carousel, which takes the mouse-down for its own dragging, so the click
never focuses the link. Even a correct default return would have had
nothing to return to there.

## The fix

The opener hands itself over with the open (`open(id, event.currentTarget)`),
the host keeps it in a ref, and the host's `onCloseAutoFocus` focuses it
when it is still connected. The search hands over its own button, since the
row that was chosen leaves with the dropdown. A deep link's arrival has no
opener, and the default stands.

## Rules

- A dialog or drawer opened from code, with no trigger rendered inside its
  root, must be given `onCloseAutoFocus` and must say where focus goes.
  `ResponsiveLightbox` and `useListeningModal` both pass it through.
- Take the opener from the event (`event.currentTarget`), not from
  `document.activeElement`: an element can be clicked without being focused.
- Check `isConnected` before focusing it. The page beneath may have changed
  while the dialog was open.
- Prove it in E2E on both paths: open with Enter on the focused opener,
  close with Escape, and assert `toBeFocused()`; then the same after a
  mouse click.
